// Compra en la tienda: precios del carrito, envío por zona, pedido y pago (Mercado Pago o transferencia).
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { direct, tx } from '../db/index.js';
import { orderWhatsappText, priceOrder } from '../rules/store.js';
import { AppError, audit, getSettings } from './common.js';
import { normalizePhone } from './sellers.js';

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export async function checkoutSettings(db = direct) {
  const s = await getSettings(db);
  return { ...(s.checkout ?? {}), transferInfo: s.checkout?.transferInfo ?? {} };
}

export const mpConfigured = () => !!config.mercadopago.accessToken;

// Lo que ve el cliente en "Finalizar compra".
export async function publicCheckout() {
  const c = await checkoutSettings();
  const zones = (await direct.query('SELECT id, name, description, price FROM shipping_zones WHERE active ORDER BY position, name')).rows;
  return {
    zones,
    methods: { mercadopago: !!c.mercadopago && mpConfigured(), transfer: !!c.transfer },
  };
}

async function productsFor(items, db = direct) {
  const ids = [...new Set((items ?? []).map((i) => Number(i.productId ?? i.id)).filter(Number.isInteger))];
  if (!ids.length) return [];
  return (await db.query('SELECT id, sku, name, slug, image_url, list_price, wholesale_price, cost, active FROM products WHERE id = ANY($1)', [ids])).rows;
}

// Precios actuales del carrito (el navegador puede tener precios viejos).
export async function quote(items, { wholesale = false } = {}) {
  const r = priceOrder(items, await productsFor(items), { wholesale });
  return { lines: r.lines.map(({ unit_cost: _c, ...l }) => l), subtotal: r.subtotal, errors: r.errors, priceType: wholesale ? 'wholesale' : 'list' };
}

const PUBLIC_ORDER = `id, public_token, customer_name, phone, address, city, notes, zone_name, shipping, subtotal, total, price_type,
  payment_method, payment_status, status, created_at`;

export async function createOrder(body, viewer) {
  const wholesale = viewer?.role === 'wholesale';
  const customer = {
    name: str(body.customer?.name, 120), phone: str(body.customer?.phone, 40), address: str(body.customer?.address, 250),
    city: str(body.customer?.city, 120), notes: str(body.customer?.notes, 500),
  };
  if (!customer.name) throw new AppError('Falta tu nombre.');
  if (!customer.address) throw new AppError('Falta la dirección de entrega.');
  let phone;
  try { phone = normalizePhone(customer.phone); } catch { throw new AppError('Revisá el teléfono: incluí el código de área.'); }
  const settings = await checkoutSettings();
  const method = body.paymentMethod;
  if (method === 'mercadopago' && !(settings.mercadopago && mpConfigured())) throw new AppError('Mercado Pago no está disponible por ahora. Elegí transferencia.');
  if (method === 'transfer' && !settings.transfer) throw new AppError('La transferencia no está disponible por ahora.');
  if (!['mercadopago', 'transfer'].includes(method)) throw new AppError('Elegí cómo vas a pagar.');

  const order = await tx(async (db) => {
    const zone = await db.one('SELECT id, name, price FROM shipping_zones WHERE id = $1 AND active', [Number(body.zoneId)]);
    if (!zone) throw new AppError('Elegí la zona de envío.');
    const priced = priceOrder(body.items, await productsFor(body.items, db), { wholesale, shipping: zone.price });
    if (priced.errors.length) throw new AppError(`${priced.errors.join(' ')} Revisá el carrito.`);
    const o = await db.one(
      `INSERT INTO web_orders (public_token, user_id, customer_name, phone, address, city, notes, zone_id, zone_name, shipping,
                               subtotal, total, cost_total, price_type, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING ${PUBLIC_ORDER}`,
      [randomBytes(12).toString('base64url'), viewer?.id ?? null, customer.name, phone, customer.address, customer.city || null,
        customer.notes || null, zone.id, zone.name, zone.price, priced.subtotal, priced.total, priced.costTotal,
        wholesale ? 'wholesale' : 'list', method],
    );
    for (const l of priced.lines) {
      await db.query(
        'INSERT INTO web_order_items (order_id, product_id, sku, name, qty, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [o.id, l.productId, l.sku, l.name, l.qty, l.unit_price, l.unit_cost],
      );
    }
    if (viewer?.id) await db.query('UPDATE users SET address = COALESCE(address, $2), city = COALESCE(city, $3) WHERE id = $1', [viewer.id, customer.address, customer.city || null]);
    await audit(db, viewer?.id ?? null, 'create', 'web_order', o.id, { total: priced.total, method });
    return o;
  });

  let payUrl = null;
  if (method === 'mercadopago') payUrl = await mercadoPagoPreference(order);
  return { order, payUrl };
}

async function mercadoPagoPreference(order) {
  const back = `${config.appUrl}/pedido/${order.public_token}`;
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mercadopago.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Pedido #${order.id} VM Bazar y Deco`, quantity: 1, unit_price: order.total / 100, currency_id: 'ARS' }],
      external_reference: `web:${order.id}`,
      notification_url: `${config.apiUrl}/api/webhooks/mercadopago`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(`Tu pedido #${order.id} quedó registrado, pero Mercado Pago no respondió (${body.message ?? res.status}). Escribinos por WhatsApp.`, 502);
  return body.init_point;
}

// Pedido visto por el cliente (con el enlace secreto).
export async function publicOrder(token) {
  const o = await direct.one(`SELECT ${PUBLIC_ORDER} FROM web_orders WHERE public_token = $1`, [token]);
  if (!o) throw new AppError('Pedido no encontrado', 404);
  const items = (await direct.query('SELECT sku, name, qty, unit_price FROM web_order_items WHERE order_id = $1 ORDER BY id', [o.id])).rows;
  const s = await getSettings();
  const c = s.checkout ?? {};
  return {
    order: o,
    items,
    transferInfo: o.payment_method === 'transfer' ? c.transferInfo ?? {} : null,
    whatsappText: orderWhatsappText(c.whatsappOrderMessage, o.id),
    whatsapp: s.store?.whatsapp ?? '',
    dispatchNote: s.store?.dispatchNote ?? 'Los pedidos se despachan de 1 a 3 días hábiles.',
  };
}

// El cliente avisa que mandó el comprobante por WhatsApp.
export async function markProofSent(token) {
  const o = await direct.one(
    `UPDATE web_orders SET payment_status = 'proof_sent' WHERE public_token = $1 AND payment_status = 'pending' RETURNING id`,
    [token],
  );
  return { ok: true, updated: !!o };
}

// Pago aprobado de Mercado Pago para un pedido web (external_reference "web:<id>"). Una sola vez por pago.
export async function webOrderPaidByMercadoPago(mp) {
  const id = Number(String(mp.external_reference).slice(4));
  const o = await direct.one('SELECT id, total, payment_status FROM web_orders WHERE id = $1', [id]);
  if (!o) return { ignored: true };
  if (Math.round(Number(mp.transaction_amount) * 100) < o.total) return { ignored: true, reason: 'monto menor al pedido' };
  const r = await direct.one(
    `UPDATE web_orders SET payment_status = 'paid', paid_at = now(), mp_payment_id = $2
      WHERE id = $1 AND payment_status <> 'paid' RETURNING id`,
    [id, String(mp.id)],
  );
  if (r) await audit(direct, null, 'paid', 'web_order', id, { mp: mp.id });
  return r ? { paid: id } : { duplicate: true };
}

// ---------- Administración ----------

export async function listZones() {
  return (await direct.query('SELECT * FROM shipping_zones ORDER BY position, name')).rows;
}

export async function saveZone(data, adminId) {
  const name = str(data.name, 80);
  if (!name) throw new AppError('Falta el nombre de la zona.');
  const price = Math.round(Number(data.price));
  if (!Number.isFinite(price) || price < 0) throw new AppError('Precio de envío inválido.');
  const vals = [name, str(data.description, 300) || null, price, data.active ?? true];
  const z = data.id
    ? await direct.one('UPDATE shipping_zones SET name = $2, description = $3, price = $4, active = $5 WHERE id = $1 RETURNING *', [data.id, ...vals])
    : await direct.one(`INSERT INTO shipping_zones (name, description, price, active, position)
                        VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM shipping_zones)) RETURNING *`, vals);
  if (!z) throw new AppError('Zona no encontrada', 404);
  await audit(direct, adminId, data.id ? 'update' : 'create', 'shipping_zone', z.id, { name, price });
  return z;
}

export async function deleteZone(id, adminId) {
  const z = await direct.one('DELETE FROM shipping_zones WHERE id = $1 RETURNING id', [id]);
  if (!z) throw new AppError('Zona no encontrada', 404);
  await audit(direct, adminId, 'delete', 'shipping_zone', id);
  return { ok: true };
}

export async function saveCheckoutSettings(data, adminId) {
  const c = {
    mercadopago: !!data.mercadopago,
    transfer: !!data.transfer,
    transferInfo: {
      alias: str(data.transferInfo?.alias, 60), cbu: str(data.transferInfo?.cbu, 30).replace(/\s/g, ''),
      holder: str(data.transferInfo?.holder, 120), bank: str(data.transferInfo?.bank, 80),
    },
    whatsappOrderMessage: str(data.whatsappOrderMessage, 300) || '¡Hola! Acabo de realizar un pedido por la página (pedido #{pedido}). Ya te envío el comprobante.',
  };
  if (!c.mercadopago && !c.transfer) throw new AppError('Dejá al menos un medio de pago activo.');
  if (c.transfer && !c.transferInfo.alias && !c.transferInfo.cbu) throw new AppError('Para cobrar por transferencia cargá el alias o el CBU/CVU.');
  await direct.query(`INSERT INTO settings (key, value) VALUES ('checkout', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [c]);
  await audit(direct, adminId, 'update', 'settings', null, { key: 'checkout' });
  return { ...c, mpConfigured: mpConfigured() };
}
