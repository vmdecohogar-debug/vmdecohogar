import { tx } from '../db/index.js';
import { today } from '../config.js';
import * as R from '../rules/index.js';
import { AppError, audit, availableCreditFor, blockingDebt, getSeller, getSettings, levelOf } from './common.js';
import { notifyUser } from './whatsapp.js';

// Trae los productos del carrito, valida stock y lo descuenta.
async function reserveItems(db, items) {
  if (!Array.isArray(items) || items.length === 0) throw new AppError('El carrito está vacío.');
  const lines = [];
  for (const { productId, qty } of items) {
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) throw new AppError('Cantidad inválida.');
    const p = await db.one('SELECT * FROM products WHERE id = $1 AND active FOR UPDATE', [productId]);
    if (!p) throw new AppError(`El producto ${productId} no existe.`);
    if (p.stock < q) throw new AppError(`No hay stock suficiente de ${p.name} (quedan ${p.stock}).`);
    await db.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [p.id, q]);
    lines.push({ product: p, qty: q, unit_price: p.price });
  }
  return lines;
}

async function insertItems(db, orderId, lines) {
  for (const l of lines) {
    await db.query('INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES ($1, $2, $3, $4)', [
      orderId, l.product.id, l.qty, l.unit_price,
    ]);
  }
}

function checkDeliveryDate(deliveryDate, settings) {
  const options = R.deliveryOptions(today(), settings.delivery);
  if (!options.includes(deliveryDate)) throw new AppError(`Elegí una fecha de entrega entre ${options[0]} y ${options.at(-1)}.`);
}

async function assertCanOrder(db, seller, settings) {
  if (seller.status !== 'active') throw new AppError('Tu cuenta todavía no está activa.', 403);
  if (await blockingDebt(seller.user_id, today(), settings.mora, db)) {
    throw new AppError('Tenés un pago atrasado: regularizalo para hacer pedidos nuevos.', 403);
  }
}

// Kit de arranque: en consignación, sin pago hasta la segunda visita.
export async function createKit(sellerId, { items, deliveryDate, deliverTo = 'seller' }) {
  return tx(async (db) => {
    const settings = await getSettings(db);
    const seller = await getSeller(sellerId, db);
    await assertCanOrder(db, seller, settings);
    const prior = await db.one(`SELECT id FROM orders WHERE seller_id = $1 AND kind = 'kit' AND status <> 'cancelled'`, [sellerId]);
    if (prior) throw new AppError('Ya tenés un kit de arranque.');
    checkDeliveryDate(deliveryDate, settings);
    const lines = await reserveItems(db, items);
    const check = R.validateKit(lines, settings.kit);
    if (!check.ok) throw new AppError(check.errors.join(' '));
    const order = await db.one(
      `INSERT INTO orders (seller_id, kind, payment_mode, subtotal, total, delivery_date, deliver_to)
       VALUES ($1, 'kit', 'consignment', $2, $2, $3, $4) RETURNING *`,
      [sellerId, check.amount, deliveryDate, deliverTo],
    );
    await insertItems(db, order.id, lines);
    await audit(db, sellerId, 'create', 'order', order.id, { kind: 'kit' });
    await notifyUser(sellerId, 'pedido_confirmado', { pedido: order.id, total: R.formatPesos(order.total), entrega: deliveryDate }, `order:${order.id}:confirmed`, db);
    return order;
  });
}

// La vendedora deja anotados los cambios que quiere para la segunda visita del kit.
export async function requestKitChanges(sellerId, orderId, changeRequest) {
  return tx(async (db) => {
    const o = await db.one(`SELECT * FROM orders WHERE id = $1 AND seller_id = $2 AND kind = 'kit'`, [orderId, sellerId]);
    if (!o) throw new AppError('Kit no encontrado', 404);
    if (o.status !== 'delivered') throw new AppError('El kit todavía no fue entregado o ya se cerró.');
    await db.query('UPDATE orders SET change_request = $2 WHERE id = $1', [orderId, changeRequest]);
  });
}

// Segunda visita del kit: se retiran productos no vendidos, se suman los agregados
// y se genera la deuda por lo que la vendedora se queda, a pagar contra entrega.
export async function closeKit(orderId, { returns = [], additions = [] }, adminId) {
  return tx(async (db) => {
    const o = await db.one(`SELECT * FROM orders WHERE id = $1 AND kind = 'kit' FOR UPDATE`, [orderId]);
    if (!o) throw new AppError('Kit no encontrado', 404);
    if (o.status !== 'delivered') throw new AppError('Solo se cierra un kit entregado y abierto.');
    for (const { itemId, qty } of returns) {
      const it = await db.one('SELECT * FROM order_items WHERE id = $1 AND order_id = $2', [itemId, orderId]);
      if (!it || qty < 0 || qty > it.qty) throw new AppError('Devolución inválida.');
      await db.query('UPDATE order_items SET returned_qty = $2 WHERE id = $1', [itemId, qty]);
      await db.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [it.product_id, qty]);
    }
    if (additions.length) await insertItems(db, orderId, await reserveItems(db, additions));
    const { v: kept } = await db.one('SELECT COALESCE(SUM((qty - returned_qty) * unit_price), 0) AS v FROM order_items WHERE order_id = $1', [orderId]);
    await db.query(`UPDATE orders SET subtotal = $2, total = $2, status = 'settled' WHERE id = $1`, [orderId, kept]);
    let obligation = null;
    if (kept > 0) {
      obligation = await db.one(
        `INSERT INTO obligations (order_id, seller_id, kind, amount, due_date) VALUES ($1, $2, 'on_delivery', $3, $4) RETURNING *`,
        [orderId, o.seller_id, kept, today()],
      );
    }
    await audit(db, adminId, 'close_kit', 'order', orderId, { returns, additions, kept });
    return { kept, obligation };
  });
}

// Pedido regular (pedidos abiertos). mode: 'prepaid' | 'on_delivery' | 'credit'.
export async function createOrder(sellerId, { items, mode, deliveryDate, deliverTo = 'seller', useBalance = true }) {
  return tx(async (db) => {
    const settings = await getSettings(db);
    const seller = await getSeller(sellerId, db);
    await assertCanOrder(db, seller, settings);
    const kit = await db.one(`SELECT status FROM orders WHERE seller_id = $1 AND kind = 'kit' AND status <> 'cancelled'`, [sellerId]);
    if (seller.level_code === 'inicial' && (!kit || kit.status !== 'settled')) {
      throw new AppError('Primero completá tu kit de arranque.');
    }
    checkDeliveryDate(deliveryDate, settings);
    const lines = await reserveItems(db, items);
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
    const level = levelOf(seller);
    const available = await availableCreditFor(seller, db);
    const priced = R.priceOrder({ subtotal, mode, level, available });

    // El saldo a favor (comisiones, excedentes) se descuenta primero de lo que hay que pagar ya.
    let balanceApplied = 0;
    if (useBalance && seller.balance_credit > 0) {
      balanceApplied = Math.min(seller.balance_credit, priced.total);
      await db.query('UPDATE sellers SET balance_credit = balance_credit - $2 WHERE user_id = $1', [sellerId, balanceApplied]);
    }
    let rest = balanceApplied;
    const take = (part) => {
      const used = Math.min(part, rest);
      rest -= used;
      return part - used;
    };
    const upfront = take(priced.upfrontPart);
    const onDelivery = take(priced.onDeliveryPart);
    const credit = take(priced.creditPart);

    const order = await db.one(
      `INSERT INTO orders (seller_id, kind, payment_mode, subtotal, discount, balance_applied, total, credit_part, upfront_part, delivery_date, deliver_to)
       VALUES ($1, 'regular', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [sellerId, mode, subtotal, priced.discount, balanceApplied, priced.total, credit, upfront + onDelivery, deliveryDate, deliverTo],
    );
    await insertItems(db, order.id, lines);
    const obligations = [];
    const addOb = async (kind, amount, due) => {
      if (amount <= 0) return;
      obligations.push(await db.one(
        'INSERT INTO obligations (order_id, seller_id, kind, amount, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [order.id, sellerId, kind, amount, due],
      ));
    };
    await addOb('upfront', upfront, deliveryDate);
    await addOb('on_delivery', onDelivery, deliveryDate);
    await addOb('credit', credit, null); // el vencimiento se fija al entregar
    await audit(db, sellerId, 'create', 'order', order.id, { mode, priced, balanceApplied });
    await notifyUser(sellerId, 'pedido_confirmado', { pedido: order.id, total: R.formatPesos(order.total), entrega: deliveryDate }, `order:${order.id}:confirmed`, db);
    return { order, obligations };
  });
}

export async function deliverOrder(orderId, adminId) {
  return tx(async (db) => {
    const o = await db.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new AppError('Pedido no encontrado', 404);
    if (o.status !== 'confirmed') throw new AppError('El pedido no está pendiente de entrega.');
    const unpaidUpfront = await db.one(`SELECT 1 FROM obligations WHERE order_id = $1 AND kind = 'upfront' AND status = 'pending'`, [orderId]);
    if (unpaidUpfront) throw new AppError('Este pedido se paga antes de la entrega y todavía no está acreditado.');
    const seller = await getSeller(o.seller_id, db);
    const day = today();
    await db.query(`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1`, [orderId]);
    await db.query(`UPDATE obligations SET due_date = $2 WHERE order_id = $1 AND kind = 'credit'`, [orderId, R.dueDateFor(day, levelOf(seller))]);
    await db.query(`UPDATE obligations SET due_date = $2 WHERE order_id = $1 AND kind = 'on_delivery'`, [orderId, day]);
    if (o.kind === 'regular') await db.query(`UPDATE orders SET status = 'settled' WHERE id = $1`, [orderId]);
    await audit(db, adminId, 'deliver', 'order', orderId);
  });
}

export async function cancelOrder(orderId, actorId, isAdmin) {
  return tx(async (db) => {
    const o = await db.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o || (!isAdmin && o.seller_id !== actorId)) throw new AppError('Pedido no encontrado', 404);
    if (o.status !== 'confirmed') throw new AppError('Solo se cancela un pedido que todavía no se entregó.');
    const paid = await db.one(`SELECT 1 FROM payments p JOIN obligations ob ON ob.id = p.obligation_id WHERE ob.order_id = $1 AND p.status <> 'rejected'`, [orderId]);
    if (paid) throw new AppError('El pedido tiene pagos registrados; cancelalo desde administración.');
    const { rows } = await db.query('SELECT product_id, qty FROM order_items WHERE order_id = $1', [orderId]);
    for (const r of rows) await db.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [r.product_id, r.qty]);
    if (o.balance_applied > 0) await db.query('UPDATE sellers SET balance_credit = balance_credit + $2 WHERE user_id = $1', [o.seller_id, o.balance_applied]);
    await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
    await db.query(`UPDATE obligations SET status = 'cancelled' WHERE order_id = $1`, [orderId]);
    await audit(db, actorId, 'cancel', 'order', orderId);
  });
}
