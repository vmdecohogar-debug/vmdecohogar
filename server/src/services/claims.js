import { today } from '../config.js';
import { direct, tx } from '../db/index.js';
import * as R from '../rules/index.js';
import { saveImage } from './catalog.js';
import { AppError, audit, getSettings } from './common.js';
import { attachSellerProfiles } from './dashboards.js';
import { notifyUser } from './whatsapp.js';

// Productos que la vendedora todavía puede reclamar: pedidos entregados (o kits cerrados) dentro del plazo,
// lo que se quedó menos lo ya reclamado (los reclamos rechazados no cuentan).
export async function claimableItems(sellerId, db = direct) {
  const { windowDays } = (await getSettings(db)).claims ?? { windowDays: 7 };
  const { rows } = await db.query(
    `SELECT i.id AS item_id, i.order_id, p.name AS product, i.unit_price,
            i.qty - i.returned_qty - COALESCE((SELECT SUM(c.qty) FROM claims c WHERE c.order_item_id = i.id AND c.status <> 'rejected'), 0) AS max_qty,
            (CASE WHEN o.kind = 'kit' THEN o.closed_at ELSE o.delivered_at END)::date + $2::int AS claim_until
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
      WHERE o.seller_id = $1
        AND (CASE WHEN o.kind = 'kit' THEN o.closed_at ELSE o.delivered_at END) IS NOT NULL
        AND (CASE WHEN o.kind = 'kit' THEN o.closed_at ELSE o.delivered_at END)::date + $2::int >= $3::date
      ORDER BY o.id DESC, i.id`,
    [sellerId, windowDays, today()],
  );
  return { windowDays, items: rows.filter((r) => r.max_qty > 0) };
}

export async function createClaim(sellerId, { itemId, qty, description, photo }) {
  const q = Number(qty);
  if (!Number.isInteger(q) || q < 1) throw new AppError('Indicá cuántas unidades tienen falla.');
  if (!description?.trim()) throw new AppError('Contanos qué falla tiene el producto.');
  if (!photo) throw new AppError('Sumá una foto de la falla.');
  const { items } = await claimableItems(sellerId);
  const item = items.find((i) => i.item_id === Number(itemId));
  if (!item) throw new AppError('Ese producto ya no se puede reclamar (pasó el plazo o ya lo reclamaste).');
  if (q > item.max_qty) throw new AppError(`Podés reclamar hasta ${item.max_qty} unidad(es) de ese producto.`);
  const { url } = await saveImage(photo);
  return direct.one(
    `INSERT INTO claims (seller_id, order_id, order_item_id, qty, description, photo_url, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [sellerId, item.order_id, item.item_id, q, description.trim(), url, q * item.unit_price],
  );
}

const CLAIM_SQL = `SELECT c.*, p.name AS product, p.id AS product_id, i.unit_price, o.kind AS order_kind, ru.name AS resolved_by_name
  FROM claims c JOIN order_items i ON i.id = c.order_item_id JOIN products p ON p.id = i.product_id
  JOIN orders o ON o.id = c.order_id LEFT JOIN users ru ON ru.id = c.resolved_by`;

export async function sellerClaims(sellerId) {
  return (await direct.query(`${CLAIM_SQL} WHERE c.seller_id = $1 ORDER BY c.id DESC LIMIT 50`, [sellerId])).rows;
}

export async function adminClaims({ status } = {}) {
  const open = !status || status === 'open';
  const { rows } = await direct.query(
    `${CLAIM_SQL} WHERE ${open ? `c.status IN ('pending', 'approved')` : 'c.status = $1'} ORDER BY c.status = 'pending' DESC, c.id LIMIT 300`,
    open ? [] : [status],
  );
  return attachSellerProfiles(rows);
}

const RESULT_TEXT = {
  replace: 'aprobado: te lo cambiamos en la próxima entrega',
  credit: (monto) => `aprobado: te descontamos ${monto}`,
  rejected: (motivo) => `no aprobado (${motivo})`,
};

// Aprobar: 'replace' reserva el producto para cambiarlo en la próxima entrega; 'credit' descuenta el valor
// de lo que debe de ese pedido y, si ya lo pagó, lo deja como saldo a favor. Rechazar requiere motivo.
export async function resolveClaim(claimId, { action, note }, adminId) {
  return tx(async (db) => {
    const c = await db.one(`${CLAIM_SQL} WHERE c.id = $1 FOR UPDATE OF c`, [claimId]);
    if (!c) throw new AppError('Reclamo no encontrado', 404);
    if (c.status !== 'pending') throw new AppError('Este reclamo ya fue resuelto.');
    const seller = await db.one('SELECT name FROM users WHERE id = $1', [c.seller_id]);
    let result;
    if (action === 'reject') {
      if (!note?.trim()) throw new AppError('Contale el motivo (por ejemplo, rotura y no falla de fábrica).');
      await db.query(`UPDATE claims SET status = 'rejected', admin_note = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [c.id, note.trim(), adminId]);
      result = RESULT_TEXT.rejected(note.trim());
    } else if (action === 'replace') {
      const p = await db.one('UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING id', [c.product_id, c.qty]);
      if (!p) throw new AppError('No hay stock para el cambio. Elegí saldo a favor o cargá stock.');
      await db.query(`UPDATE claims SET status = 'approved', resolution = 'replace', admin_note = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [c.id, note?.trim() || null, adminId]);
      result = RESULT_TEXT.replace;
    } else if (action === 'credit') {
      let rest = c.amount;
      // Primero baja lo que todavía debe de ese pedido.
      const { rows: obs } = await db.query(
        `SELECT * FROM obligations WHERE order_id = $1 AND status = 'pending' ORDER BY id FOR UPDATE`,
        [c.order_id],
      );
      for (const ob of obs) {
        const cut = Math.min(rest, ob.amount - ob.paid_principal);
        if (cut <= 0) continue;
        const fullyPaid = ob.amount - cut === ob.paid_principal && ob.surcharge === ob.paid_surcharge;
        await db.query(
          `UPDATE obligations SET amount = amount - $2, status = CASE WHEN $3 THEN 'paid' ELSE status END,
                  paid_at = CASE WHEN $3 THEN now() ELSE paid_at END WHERE id = $1`,
          [ob.id, cut, fullyPaid],
        );
        rest -= cut;
      }
      if (rest > 0) await db.query('UPDATE sellers SET balance_credit = balance_credit + $2 WHERE user_id = $1', [c.seller_id, rest]);
      await db.query(`UPDATE claims SET status = 'resolved', resolution = 'credit', admin_note = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [c.id, note?.trim() || null, adminId]);
      result = RESULT_TEXT.credit(R.formatPesos(c.amount));
    } else {
      throw new AppError('Acción desconocida.');
    }
    await audit(db, adminId, `claim_${action}`, 'claim', c.id, { note });
    await notifyUser(c.seller_id, 'reclamo_respuesta', { nombre: seller.name, producto: c.product, resultado: result }, `claim:${c.id}:${action}`, db);
    return db.one('SELECT * FROM claims WHERE id = $1', [c.id]);
  });
}

// El cambio ya se entregó.
export async function markReplaced(claimId, adminId) {
  const c = await direct.one(`UPDATE claims SET status = 'resolved' WHERE id = $1 AND status = 'approved' RETURNING *`, [claimId]);
  if (!c) throw new AppError('Reclamo no encontrado o ya entregado.', 404);
  await audit(direct, adminId, 'claim_replaced', 'claim', claimId);
  return c;
}
