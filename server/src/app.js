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

const SETTING_KEYS = ['kit', 'commissions', 'mora', 'delivery'];

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

// Envuelve handlers async para que los errores lleguen al manejador central.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => res.json(data ?? { ok: true }), next);

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', h(() => ({ ok: true })));

  // Público
  app.post('/api/auth/register', h(async (req) => sellers.registerSeller(req.body)));
  app.post('/api/auth/login', h(async (req) => {
    const u = await sellers.login(req.body.phone, req.body.password);
    return { token: sign(u), user: { id: u.id, name: u.name, role: u.role, status: u.status } };
  }));
  app.get('/api/referral/:code', h(async (req) => {
    const r = await direct.one(
      `SELECT u.name FROM sellers s JOIN users u ON u.id = s.user_id WHERE upper(s.referral_code) = upper($1) AND u.status = 'active'`,
      [req.params.code],
    );
    if (!r) throw new AppError('Código no encontrado', 404);
    return { name: r.name.split(' ')[0] };
  }));
  app.post('/api/webhooks/mercadopago', h(async (req) => {
    const id = req.query['data.id'] ?? req.body?.data?.id ?? req.query.id;
    return payments.handleMercadoPagoNotification(id);
  }));

  app.use('/api', auth);
  app.get('/api/me', h(async (req) => {
    const s = req.user.role === 'seller' ? await direct.one('SELECT is_leader FROM sellers WHERE user_id = $1', [req.user.id]) : null;
    return { ...req.user, isLeader: !!s?.is_leader };
  }));
  app.get('/api/products', h(async () => (await direct.query('SELECT id, sku, name, price, suggested_price, stock FROM products WHERE active ORDER BY name')).rows));
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
  app.get('/api/admin/orders', admin, h(async (req) => (await direct.query(
    `SELECT o.*, u.name AS seller_name, u.address,
            (SELECT json_agg(json_build_object('id', i.id, 'product', p.name, 'qty', i.qty, 'returned_qty', i.returned_qty, 'unit_price', i.unit_price))
               FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = o.id) AS items
       FROM orders o JOIN users u ON u.id = o.seller_id
      WHERE ($1::text IS NULL OR o.status = $1) ORDER BY o.delivery_date, o.id LIMIT 300`,
    [req.query.status ?? null],
  )).rows));
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
  app.post('/api/admin/products', admin, h(async (req) => {
    const { sku, name, price, suggested_price: suggested, stock } = req.body;
    return direct.one(
      `INSERT INTO products (sku, name, price, suggested_price, stock) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, suggested_price = EXCLUDED.suggested_price, stock = EXCLUDED.stock
       RETURNING *`,
      [sku, name, price, suggested, stock ?? 0],
    );
  }));
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
