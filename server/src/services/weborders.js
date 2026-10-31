// Panel de pedidos de la tienda: datos de entrega, lista de compras, ganancia y total vendido.
import { direct, tx } from '../db/index.js';
import { AppError, audit } from './common.js';

// Estados del pedido y a cuáles se puede pasar desde cada uno.
const NEXT = {
  new: ['ready', 'cancelled'],
  ready: ['delivered', 'new', 'cancelled'],
  delivered: ['ready'],
  cancelled: ['new'],
};
const SOLD = "('ready', 'delivered')";

// Ganancia de la mercadería: lo cobrado por productos menos su costo. El envío no suma.
const PROFIT = 'o.subtotal - o.cost_total';
// Ítems cuyo producto no tenía costo cargado al momento de la compra (la ganancia sale incompleta).
const MISSING_COST = '(SELECT count(*)::int FROM web_order_items i WHERE i.order_id = o.id AND i.unit_cost IS NULL)';

export async function listOrders({ status } = {}) {
  const where = status && NEXT[status] ? 'WHERE o.status = $1' : '';
  const orders = (await direct.query(
    `SELECT o.id, o.customer_name, o.phone, o.address, o.city, o.notes, o.zone_name, o.shipping, o.subtotal, o.total,
            o.cost_total, ${PROFIT} AS profit, ${MISSING_COST} AS missing_cost, o.price_type, o.payment_method,
            o.payment_status, o.status, o.created_at, o.paid_at, o.ready_at, o.public_token
       FROM web_orders o ${where}
      ORDER BY o.created_at DESC LIMIT 300`,
    where ? [status] : [],
  )).rows;
  if (!orders.length) return [];
  const items = (await direct.query(
    'SELECT order_id, product_id, sku, name, qty, unit_price, unit_cost FROM web_order_items WHERE order_id = ANY($1) ORDER BY id',
    [orders.map((o) => o.id)],
  )).rows;
  const byOrder = Map.groupBy(items, (i) => i.order_id);
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

// Lista consolidada de lo que hay que comprar o tener en stock: todo lo de los pedidos nuevos.
export async function shoppingList() {
  const rows = (await direct.query(
    `SELECT COALESCE(i.product_id::text, i.sku, i.name) AS key, i.product_id,
            COALESCE(p.sku, i.sku) AS sku, COALESCE(p.name, i.name) AS name, p.image_url, p.stock,
            sum(i.qty)::int AS qty, count(DISTINCT i.order_id)::int AS orders,
            sum(i.qty * i.unit_cost)::bigint AS cost, bool_or(i.unit_cost IS NULL) AS missing_cost
       FROM web_order_items i
       JOIN web_orders o ON o.id = i.order_id AND o.status = 'new'
       LEFT JOIN products p ON p.id = i.product_id
      GROUP BY 1, 2, 3, 4, 5, 6
      ORDER BY name`,
  )).rows;
  return {
    items: rows,
    units: rows.reduce((s, r) => s + r.qty, 0),
    cost: rows.reduce((s, r) => s + Number(r.cost ?? 0), 0),
  };
}

// Total vendido: pedidos listos para entrega o entregados.
export async function salesSummary() {
  const sum = (where, params = []) => direct.one(
    `SELECT count(*)::int AS orders, COALESCE(sum(o.total), 0)::bigint AS total, COALESCE(sum(o.subtotal), 0)::bigint AS products,
            COALESCE(sum(o.shipping), 0)::bigint AS shipping, COALESCE(sum(o.cost_total), 0)::bigint AS cost,
            COALESCE(sum(${PROFIT}), 0)::bigint AS profit
       FROM web_orders o WHERE o.status IN ${SOLD} ${where}`,
    params,
  );
  const counts = (await direct.query(
    `SELECT status, count(*)::int AS n FROM web_orders GROUP BY status
     UNION ALL
     SELECT 'to_confirm', count(*)::int FROM web_orders WHERE payment_status = 'proof_sent' AND status <> 'cancelled'`,
  )).rows;
  return {
    month: await sum("AND COALESCE(o.ready_at, o.created_at) >= date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires'"),
    all: await sum(''),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  };
}

export async function setStatus(id, status, adminId) {
  return tx(async (db) => {
    const o = await db.one('SELECT id, status FROM web_orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw new AppError('Pedido no encontrado', 404);
    if (o.status === status) return o;
    if (!NEXT[o.status]?.includes(status)) throw new AppError('Ese cambio de estado no se puede hacer.');
    const r = await db.one(
      `UPDATE web_orders SET status = $2,
              ready_at = CASE WHEN $2 = 'ready' AND ready_at IS NULL THEN now() WHEN $2 IN ('new', 'cancelled') THEN NULL ELSE ready_at END
        WHERE id = $1 RETURNING id, status, ready_at`,
      [id, status],
    );
    await audit(db, adminId, 'status', 'web_order', id, { from: o.status, to: status });
    return r;
  });
}

// Confirmar (o rechazar) a mano el pago, por ejemplo al recibir el comprobante de transferencia.
export async function setPayment(id, paymentStatus, adminId) {
  if (!['pending', 'paid', 'rejected'].includes(paymentStatus)) throw new AppError('Estado de pago inválido.');
  const r = await direct.one(
    `UPDATE web_orders SET payment_status = $2, paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, now()) ELSE NULL END
      WHERE id = $1 RETURNING id, payment_status, paid_at`,
    [id, paymentStatus],
  );
  if (!r) throw new AppError('Pedido no encontrado', 404);
  await audit(direct, adminId, 'payment', 'web_order', id, { payment_status: paymentStatus });
  return r;
}
