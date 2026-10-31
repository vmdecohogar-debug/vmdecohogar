import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { direct } from './db/index.js';
import { AppError, audit, getSettings } from './services/common.js';
import * as sellers from './services/sellers.js';
import * as orders from './services/orders.js';
import * as payments from './services/payments.js';
import * as dash from './services/dashboards.js';
import { runDaily } from './services/daily.js';
import { closePeriod, markSettlementPaid } from './services/commissions.js';
import { render } from './services/whatsapp.js';
import * as catalog from './services/catalog.js';
import * as claims from './services/claims.js';
import * as store from './services/store.js';
import * as seo from './services/seo.js';
import * as checkout from './services/checkout.js';
import * as weborders from './services/weborders.js';
import * as wholesale from './services/wholesale.js';

const SETTING_KEYS = ['kit', 'commissions', 'mora', 'delivery', 'claims'];

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });
}

async function auth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return next(new AppError('Iniciá sesión.', 401));
  try {
    const { id } = jwt.verify(token, config.jwtSecret);
    const u = await direct.one('SELECT id, name, role, status FROM users WHERE id = $1', [id]);
    if (!u || u.status === 'inactive') throw new Error();
    req.user = u;
    next();
  } catch {
    next(new AppError('La sesión venció. Volvé a ingresar.', 401));
  }
}

const admin = (req, _res, next) => (req.user.role === 'admin' ? next() : next(new AppError('Solo administración.', 403)));
const seller = (req, _res, next) => (req.user.role === 'seller' ? next() : next(new AppError('Solo vendedoras.', 403)));
async function leader(req, _res, next) {
  const s = await direct.one('SELECT is_leader FROM sellers WHERE user_id = $1', [req.user.id]);
  return s?.is_leader ? next() : next(new AppError('El panel de jefa zonal se activa con 10 referidas activas.', 403));
}

// Quién mira la tienda (sin sesión = público). No falla si el token venció.
async function viewer(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, config.jwtSecret);
    return await direct.one('SELECT id, name, role, status FROM users WHERE id = $1', [id]);
  } catch {
    return null;
  }
}

// El precio mayorista solo se muestra a cuentas mayoristas activas.
async function canSeeWholesale(req) {
  const u = await viewer(req);
  return u?.role === 'wholesale' && u.status === 'active';
}

// Envuelve handlers async para que los errores lleguen al manejador central.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => res.json(data ?? { ok: true }), next);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.get('/uploads/:name', async (req, res, next) => {
    try {
      const img = await catalog.getImage(req.params.name);
      if (!img) return next();
      res.set('Cache-Control', 'public, max-age=2592000, immutable').type(img.mime).send(img.data);
    } catch (e) {
      next(e);
    }
  });
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d' }));

  app.get('/api/health', h(() => ({ ok: true })));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(seo.robots()));
  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      res.type('application/xml').send(await seo.sitemap());
    } catch (e) {
      next(e);
    }
  });

  // Tienda pública
  app.get('/api/store/config', h(async () => store.publicConfig()));
  app.get('/api/store/home', h(async (req) => store.home({ showWholesale: await canSeeWholesale(req) })));
  app.get('/api/store/products', h(async (req) => store.publicProducts({ ...req.query, showWholesale: await canSeeWholesale(req) })));
  app.get('/api/store/products/:slug', h(async (req) => store.publicProduct(req.params.slug, { showWholesale: await canSeeWholesale(req) })));
  app.get('/api/store/checkout', h(async () => checkout.publicCheckout()));
  app.post('/api/store/quote', h(async (req) => checkout.quote(req.body.items, { wholesale: await canSeeWholesale(req) })));
  app.post('/api/store/orders', h(async (req) => {
    const v = await viewer(req);
    return checkout.createOrder(req.body, v?.status === 'active' ? v : null);
  }));
  app.get('/api/store/orders/:token', h(async (req) => checkout.publicOrder(req.params.token)));
  app.post('/api/store/orders/:token/proof', h(async (req) => checkout.markProofSent(req.params.token)));
  app.post('/api/store/wholesale/register', h(async (req) => {
    const u = await wholesale.register(req.body);
    return u.status === 'active' ? { status: u.status, token: sign(u), user: u } : { status: u.status };
  }));

  // Público
  app.post('/api/auth/login', h(async (req) => {
    const u = await sellers.login(req.body.phone, req.body.password);
    if (u.role === 'wholesale' && u.status === 'pending') throw new AppError('Tu cuenta mayorista está pendiente de aprobación. Te avisamos por WhatsApp.', 403);
    if (u.role === 'wholesale' && u.status === 'blocked') throw new AppError('Tu cuenta mayorista está pausada. Escribinos por WhatsApp.', 403);
    return { token: sign(u), user: { id: u.id, name: u.name, role: u.role, status: u.status } };
  }));
  app.post('/api/webhooks/mercadopago', h(async (req) => {
    const id = req.query['data.id'] ?? req.body?.data?.id ?? req.query.id;
    return payments.handleMercadoPagoNotification(id);
  }));

  app.use('/api', auth);
  app.get('/api/me', h(async (req) => {
    const s = req.user.role === 'seller' ? await direct.one('SELECT is_leader FROM sellers WHERE user_id = $1', [req.user.id]) : null;
    const u = await direct.one('SELECT onboarded_at, phone, address, city, business FROM users WHERE id = $1', [req.user.id]);
    const { onboarded_at: onb, ...contact } = u;
    return { ...req.user, ...contact, isLeader: !!s?.is_leader, onboarded: req.user.role === 'admin' || !!onb };
  }));
  app.post('/api/me/onboarded', h(async (req) => {
    await direct.query('UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1', [req.user.id]);
    return { ok: true };
  }));
  // Lo que explica la bienvenida: niveles y reglas vigentes, para que los números sean siempre los configurados.
  app.get('/api/onboarding', h(async () => {
    const settings = await getSettings(direct);
    const levels = (await direct.query('SELECT code, name, credit_limit, term_days, early_discount_pct FROM levels ORDER BY rank')).rows;
    return { levels, kit: settings.kit, commissions: settings.commissions, mora: settings.mora, delivery: settings.delivery, claims: settings.claims ?? { windowDays: 7 } };
  }));
  app.get('/api/products', h(async () => catalog.listProducts()));
  app.get('/api/obligations/:id/pay-link', h(async (req) => {
    const ob = await direct.one('SELECT seller_id FROM obligations WHERE id = $1', [req.params.id]);
    if (!ob || (req.user.role !== 'admin' && ob.seller_id !== req.user.id)) throw new AppError('Deuda no encontrada', 404);
    return payments.createPaymentLink(Number(req.params.id));
  }));
  app.post('/api/payments', h(async (req) => payments.registerPayment(req.body, req.user)));

  // Vendedora
  app.get('/api/seller/dashboard', seller, h(async (req) => dash.sellerDashboard(req.user.id)));
  app.post('/api/seller/kit', seller, h(async (req) => orders.createKit(req.user.id, req.body)));
  app.post('/api/seller/kit/:id/changes', seller, h(async (req) => orders.requestKitChanges(req.user.id, Number(req.params.id), req.body)));
  app.post('/api/seller/orders', seller, h(async (req) => orders.createOrder(req.user.id, req.body)));
  app.get('/api/seller/claims', seller, h(async (req) => ({ ...(await claims.claimableItems(req.user.id)), claims: await claims.sellerClaims(req.user.id) })));
  app.post('/api/seller/claims', seller, h(async (req) => claims.createClaim(req.user.id, req.body)));
  app.post('/api/seller/orders/:id/cancel', seller, h(async (req) => orders.cancelOrder(Number(req.params.id), req.user.id, false)));

  // Jefa zonal
  app.get('/api/leader/dashboard', seller, leader, h(async (req) => dash.leaderDashboard(req.user.id)));
  app.post('/api/leader/alerts/:id', seller, leader, h(async (req) => {
    const a = await direct.one(
      `UPDATE alerts SET status = 'handled', note = COALESCE($3, note) WHERE id = $1 AND recipient_id = $2 RETURNING *`,
      [req.params.id, req.user.id, req.body.note ?? null],
    );
    if (!a) throw new AppError('Alerta no encontrada', 404);
    return a;
  }));

  // Administración
  app.get('/api/admin/dashboard', admin, h(async () => dash.adminDashboard()));
  app.get('/api/admin/sellers', admin, h(async () => (await direct.query(
    `SELECT u.id, u.name, u.phone, u.dni, u.status, u.created_at, s.referral_code, s.level_code, s.is_leader, s.credit_limit_override,
            s.balance_credit, s.zone_id, r.name AS referred_by_name
       FROM sellers s JOIN users u ON u.id = s.user_id LEFT JOIN users r ON r.id = s.referred_by ORDER BY u.status = 'pending' DESC, u.name`,
  )).rows));
  app.post('/api/admin/sellers/:id/approve', admin, h(async (req) => sellers.approveSeller(Number(req.params.id), req.user.id, req.body.zoneId)));
  app.post('/api/admin/sellers/:id/status', admin, h(async (req) => sellers.setSellerStatus(Number(req.params.id), req.body.status, req.user.id)));
  app.post('/api/admin/sellers/:id/override', admin, h(async (req) => sellers.overrideSeller(Number(req.params.id), req.body, req.user.id)));
  app.get('/api/admin/orders', admin, h(async (req) => dash.adminOrders({ status: req.query.status })));
  app.get('/api/admin/claims', admin, h(async (req) => claims.adminClaims({ status: req.query.status })));
  app.post('/api/admin/claims/:id/resolve', admin, h(async (req) => claims.resolveClaim(Number(req.params.id), req.body, req.user.id)));
  app.post('/api/admin/claims/:id/replaced', admin, h(async (req) => claims.markReplaced(Number(req.params.id), req.user.id)));
  app.get('/api/admin/counts', admin, h(async () => dash.adminCounts()));
  app.post('/api/admin/orders/:id/deliver', admin, h(async (req) => orders.deliverOrder(Number(req.params.id), req.user.id)));
  app.post('/api/admin/orders/:id/cancel', admin, h(async (req) => orders.cancelOrder(Number(req.params.id), req.user.id, true)));
  app.post('/api/admin/kits/:id/close', admin, h(async (req) => orders.closeKit(Number(req.params.id), req.body, req.user.id)));
  app.get('/api/admin/obligations', admin, h(async (req) => dash.listObligations({ status: req.query.status })));
  app.get('/api/admin/payments', admin, h(async (req) => (await direct.query(
    `SELECT p.*, u.name AS seller_name, c.name AS collected_by_name FROM payments p
       JOIN users u ON u.id = p.seller_id LEFT JOIN users c ON c.id = p.collected_by
      WHERE ($1::text IS NULL OR p.status = $1) ORDER BY p.created_at DESC LIMIT 300`,
    [req.query.status ?? null],
  )).rows));
  app.post('/api/admin/payments/:id/credit', admin, h(async (req) => payments.creditPayment(Number(req.params.id), req.user.id)));
  app.post('/api/admin/payments/:id/reject', admin, h(async (req) => payments.rejectPayment(Number(req.params.id), req.user.id)));
  app.get('/api/admin/alerts', admin, h(async () => (await direct.query(
    `SELECT a.*, u.name AS seller_name, r.name AS recipient_name FROM alerts a
       LEFT JOIN users u ON u.id = a.seller_id LEFT JOIN users r ON r.id = a.recipient_id
      WHERE a.status <> 'closed' ORDER BY a.created_at DESC LIMIT 300`,
  )).rows));
  app.get('/api/admin/messages', admin, h(async () => (await direct.query(
    `SELECT m.*, u.name AS recipient_name FROM messages m LEFT JOIN users u ON u.id = m.recipient_id ORDER BY m.created_at DESC LIMIT 200`,
  )).rows.map((m) => ({ ...m, text: render(m.template, m.vars) }))));
  // Tienda online (administración)
  app.get('/api/admin/store/counts', admin, h(async () => store.storeCounts()));
  app.get('/api/admin/store/products', admin, h(async () => ({ products: await store.adminProducts(), categories: await store.listCategories({ includeInactive: true }) })));
  app.post('/api/admin/store/products', admin, h(async (req) => store.saveStoreProduct(req.body, req.user.id)));
  app.post('/api/admin/store/products/recalc', admin, h(async (req) => store.recalcPrices(req.user.id)));
  app.post('/api/admin/store/products/:id/discount', admin, h(async (req) => store.setDiscount(Number(req.params.id), req.body?.discount_pct, req.user.id)));
  app.get('/api/admin/store/categories', admin, h(async () => store.listCategories({ includeInactive: true })));
  app.post('/api/admin/store/categories', admin, h(async (req) => store.saveCategory(req.body, req.user.id)));
  app.put('/api/admin/store/categories/order', admin, h(async (req) => store.reorder('categories', req.body.ids, req.user.id)));
  app.delete('/api/admin/store/categories/:id', admin, h(async (req) => store.deleteCategory(Number(req.params.id), req.user.id)));
  app.get('/api/admin/store/banners', admin, h(async () => store.listBanners({ includeInactive: true })));
  app.post('/api/admin/store/banners', admin, h(async (req) => store.saveBanner(req.body, req.user.id)));
  app.put('/api/admin/store/banners/order', admin, h(async (req) => store.reorder('banners', req.body.ids, req.user.id)));
  app.delete('/api/admin/store/banners/:id', admin, h(async (req) => store.deleteBanner(Number(req.params.id), req.user.id)));
  app.get('/api/admin/store/settings', admin, h(async () => store.storeSettings()));
  app.put('/api/admin/store/settings', admin, h(async (req) => store.saveStoreSettings(req.body, req.user.id)));
  app.get('/api/admin/store/zones', admin, h(async () => checkout.listZones()));
  app.post('/api/admin/store/zones', admin, h(async (req) => checkout.saveZone(req.body, req.user.id)));
  app.delete('/api/admin/store/zones/:id', admin, h(async (req) => checkout.deleteZone(Number(req.params.id), req.user.id)));
  app.get('/api/admin/store/checkout', admin, h(async () => ({ ...(await checkout.checkoutSettings()), mpConfigured: checkout.mpConfigured() })));
  app.put('/api/admin/store/checkout', admin, h(async (req) => checkout.saveCheckoutSettings(req.body, req.user.id)));
  app.get('/api/admin/store/wholesale', admin, h(async () => ({ customers: await wholesale.list(), settings: await wholesale.wholesaleSettings() })));
  app.post('/api/admin/store/wholesale', admin, h(async (req) => wholesale.register(req.body, { byAdmin: req.user.id })));
  app.post('/api/admin/store/wholesale/:id/status', admin, h(async (req) => wholesale.setStatus(Number(req.params.id), req.body.status, req.user.id)));
  app.post('/api/admin/store/wholesale/invite', admin, h(async (req) => wholesale.newInvite(req.user.id, req.body.requireApproval)));
  app.put('/api/admin/store/wholesale/settings', admin, h(async (req) => wholesale.setRequireApproval(req.body.requireApproval, req.user.id)));
  app.get('/api/admin/store/orders', admin, h(async (req) => ({ orders: await weborders.listOrders({ status: req.query.status }), summary: await weborders.salesSummary() })));
  app.get('/api/admin/store/orders/shopping', admin, h(async () => weborders.shoppingList()));
  app.post('/api/admin/store/orders/:id/status', admin, h(async (req) => weborders.setStatus(Number(req.params.id), req.body.status, req.user.id)));
  app.post('/api/admin/store/orders/:id/payment', admin, h(async (req) => weborders.setPayment(Number(req.params.id), req.body.paymentStatus, req.user.id)));
  app.put('/api/admin/store/theme', admin, h(async (req) => store.saveTheme(req.body, req.user.id)));

  app.get('/api/admin/products', admin, h(async () => ({ products: await catalog.listProducts({ includeInactive: true }), categories: await catalog.listCategories() })));
  app.post('/api/admin/products', admin, h(async (req) => catalog.saveProduct(req.body, req.user.id)));
  app.post('/api/admin/products/:id/active', admin, h(async (req) => catalog.setProductActive(Number(req.params.id), req.body.active, req.user.id)));
  app.post('/api/admin/products/import/preview', admin, h(async (req) => catalog.previewImport(req.body.text)));
  app.post('/api/admin/products/import', admin, h(async (req) => catalog.importProducts(req.body.text, req.user.id)));
  app.post('/api/admin/uploads', admin, h(async (req) => catalog.saveImage(req.body.dataUrl)));
  app.get('/api/admin/levels', admin, h(async () => (await direct.query('SELECT * FROM levels ORDER BY rank')).rows));
  app.put('/api/admin/levels/:code', admin, h(async (req) => {
    const { credit_limit: limit, term_days: term, early_discount_pct: pct, required_clean_orders: req2 } = req.body;
    const l = await direct.one(
      `UPDATE levels SET credit_limit = $2, term_days = $3, early_discount_pct = $4, required_clean_orders = $5 WHERE code = $1 RETURNING *`,
      [req.params.code, limit, term, pct, req2],
    );
    await audit(direct, req.user.id, 'update', 'level', null, l);
    return l;
  }));
  app.get('/api/admin/settings', admin, h(async () => getSettings()));
  app.put('/api/admin/settings/:key', admin, h(async (req) => {
    if (!SETTING_KEYS.includes(req.params.key)) throw new AppError('Configuración desconocida', 404);
    await direct.query('UPDATE settings SET value = $2 WHERE key = $1', [req.params.key, req.body]);
    await audit(direct, req.user.id, 'update', 'settings', null, { key: req.params.key, value: req.body });
    return getSettings();
  }));
  app.post('/api/admin/run-daily', admin, h(async () => runDaily()));
  app.post('/api/admin/commissions/close', admin, h(async (req) => closePeriod(req.body.period, req.user.id, req.body.method)));
  app.get('/api/admin/settlements', admin, h(async () => (await direct.query(
    `SELECT st.*, u.name FROM settlements st JOIN users u ON u.id = st.beneficiary_id ORDER BY st.period DESC, u.name`,
  )).rows));
  app.post('/api/admin/settlements/:id/paid', admin, h(async (req) => markSettlementPaid(Number(req.params.id), req.user.id)));

  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno. Probá de nuevo.' : err.message });
  });
  return app;
}
