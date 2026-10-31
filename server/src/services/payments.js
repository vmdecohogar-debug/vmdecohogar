import { tx, direct } from '../db/index.js';
import { config, today } from '../config.js';
import * as R from '../rules/index.js';
import {
  AppError, activeDirectCount, audit, availableCreditFor, getLevels, getSeller, getSettings, paymentLink, referralChain,
} from './common.js';
import { notifyUser } from './whatsapp.js';

// Momento de acreditación; respeta la fecha simulada (TODAY_OVERRIDE) para pruebas.
function nowFor(day) {
  return config.today ? new Date(`${day}T12:00:00Z`) : new Date();
}

// Registra un pago. Administración lo acredita en el momento; la jefa zonal (efectivo) y la vendedora
// (transferencia con referencia) lo dejan informado hasta que administración lo confirma.
export async function registerPayment({ obligationId, sellerId, amount, method, externalRef }, actor) {
  const cents = Math.round(Number(amount));
  if (!Number.isFinite(cents) || cents <= 0) throw new AppError('Monto inválido.');
  if (!['mercadopago', 'cash', 'transfer'].includes(method)) throw new AppError('Medio de pago inválido.');
  const payment = await tx(async (db) => {
    // Sin número de deuda (efectivo de la jefa zonal): se imputa a la deuda pendiente más antigua.
    const ob = obligationId
      ? await db.one('SELECT * FROM obligations WHERE id = $1', [obligationId])
      : await db.one(
        `SELECT * FROM obligations WHERE seller_id = $1 AND status IN ('pending', 'bad_debt')
          ORDER BY due_date NULLS LAST, id LIMIT 1`,
        [sellerId],
      );
    if (!ob || !['pending', 'bad_debt'].includes(ob.status)) throw new AppError('No hay deuda pendiente con ese número.', 404);
    if (actor.role !== 'admin') {
      const isOwner = ob.seller_id === actor.id;
      const leader = !isOwner && (await db.one('SELECT is_leader FROM sellers WHERE user_id = $1', [actor.id]))?.is_leader;
      const inNetwork = leader && (await referralChain(ob.seller_id, db)).includes(actor.id);
      if (!isOwner && !inNetwork) throw new AppError('No podés registrar pagos de esta deuda.', 403);
      if (isOwner && method === 'cash') throw new AppError('El efectivo lo registra tu jefa zonal o administración.');
    }
    const p = await db.one(
      `INSERT INTO payments (obligation_id, seller_id, amount, method, external_ref, collected_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [ob.id, ob.seller_id, cents, method, externalRef ?? null, actor.id],
    );
    await audit(db, actor.id, 'register', 'payment', p.id, { amount: cents, method });
    return p;
  });
  if (actor.role === 'admin') return creditPayment(payment.id, actor.id);
  return payment;
}

export async function rejectPayment(paymentId, adminId) {
  const p = await direct.one(`UPDATE payments SET status = 'rejected' WHERE id = $1 AND status = 'reported' RETURNING *`, [paymentId]);
  if (!p) throw new AppError('Pago no encontrado o ya procesado.', 404);
  await audit(direct, adminId, 'reject', 'payment', paymentId);
  return p;
}

// Acredita un pago: imputa capital y recargo, libera cupo, genera comisiones,
// actualiza nivel y ascenso a jefa zonal, y avisa por WhatsApp.
export async function creditPayment(paymentId, adminId) {
  const day = today();
  const result = await tx(async (db) => {
    const p = await db.one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    if (!p) throw new AppError('Pago no encontrado', 404);
    if (p.status !== 'reported') throw new AppError('El pago ya fue procesado.');
    const ob = await db.one('SELECT * FROM obligations WHERE id = $1 FOR UPDATE', [p.obligation_id]);
    const settings = await getSettings(db);
    const levels = await getLevels(db);

    const alloc = R.allocatePayment(ob, p.amount);
    const lateNow = R.daysLate(ob.due_date, day);
    const maxLate = Math.max(ob.max_days_late, lateNow);
    await db.query(
      `UPDATE obligations SET paid_principal = paid_principal + $2, paid_surcharge = paid_surcharge + $3,
              max_days_late = $4, status = CASE WHEN $5 THEN 'paid' ELSE status END,
              paid_at = CASE WHEN $5 THEN now() ELSE paid_at END
        WHERE id = $1`,
      [ob.id, alloc.principal, alloc.surcharge, maxLate, alloc.fullyPaid],
    );
    await db.query(`UPDATE payments SET status = 'credited', credited_at = $3, principal = $2 WHERE id = $1`, [p.id, alloc.principal, nowFor(day)]);
    if (alloc.excess > 0) await db.query('UPDATE sellers SET balance_credit = balance_credit + $2 WHERE user_id = $1', [p.seller_id, alloc.excess]);

    // Comisiones: 3% a la referidora directa y 1% a la siguiente, sobre el capital cobrado.
    const chain = await referralChain(p.seller_id, db);
    for (const c of R.commissionsFor({ principal: alloc.principal, chain }, settings.commissions)) {
      await db.query(
        `INSERT INTO commissions (beneficiary_id, payment_id, tier, base, pct, amount, period) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c.beneficiaryId, p.id, c.tier, alloc.principal, c.pct, c.amount, R.periodOf(day)],
      );
    }

    const seller = await getSeller(p.seller_id, db);
    let levelChange = null;
    if (alloc.fullyPaid && ob.kind !== 'upfront') {
      const next = R.levelAfterPayment(
        { currentCode: seller.level_code, streak: seller.clean_streak, paidOnTime: maxLate <= settings.mora.lateToleranceDays },
        levels,
      );
      await db.query('UPDATE sellers SET level_code = $2, clean_streak = $3 WHERE user_id = $1', [p.seller_id, next.code, next.streak]);
      if (next.changed) levelChange = levels.find((l) => l.code === next.code);
    } else if (alloc.fullyPaid && seller.level_code === 'inicial') {
      // Un pedido pagado por adelantado también cuenta como "primer pedido pagado".
      const next = R.levelAfterPayment({ currentCode: 'inicial', streak: seller.clean_streak, paidOnTime: true }, levels);
      await db.query('UPDATE sellers SET level_code = $2 WHERE user_id = $1', [p.seller_id, next.code]);
      levelChange = levels.find((l) => l.code === next.code);
    }
    if (alloc.fullyPaid) {
      await db.query(`UPDATE alerts SET status = 'closed' WHERE obligation_id = $1 AND status <> 'closed'`, [ob.id]);
    }

    // Ascenso automático a jefa zonal de la referidora directa.
    let promoted = null;
    if (chain[0]) {
      const ref = await db.one('SELECT is_leader FROM sellers WHERE user_id = $1', [chain[0]]);
      const active = await activeDirectCount(chain[0], day, settings.commissions.activeWindowDays, db);
      if (!ref.is_leader && R.leaderStatus(active, settings.commissions).isLeader) {
        await db.query('UPDATE sellers SET is_leader = true, leader_since = now() WHERE user_id = $1', [chain[0]]);
        promoted = chain[0];
      }
    }
    await audit(db, adminId, 'credit', 'payment', p.id, { alloc });
    return { payment: p, alloc, seller, levelChange, promoted };
  });

  // Avisos fuera de la transacción: si WhatsApp falla, el pago igual queda acreditado.
  const { payment, seller, levelChange, promoted } = result;
  const pending = await direct.one(
    `SELECT COALESCE(SUM(amount + surcharge - paid_principal - paid_surcharge), 0) AS v FROM obligations
      WHERE seller_id = $1 AND status IN ('pending', 'bad_debt')`,
    [payment.seller_id],
  );
  const fresh = await getSeller(payment.seller_id);
  await notifyUser(payment.seller_id, 'pago_recibido', {
    nombre: seller.name,
    monto: R.formatPesos(payment.amount),
    saldo: R.formatPesos(pending.v),
    cupo: R.formatPesos(await availableCreditFor(fresh)),
  }, `payment:${payment.id}:credited`);
  if (levelChange) await notifyUser(payment.seller_id, 'subida_nivel', { nombre: seller.name, nivel: levelChange.name }, `level:${payment.seller_id}:${levelChange.code}:${payment.id}`);
  if (promoted) {
    const u = await direct.one('SELECT name FROM users WHERE id = $1', [promoted]);
    await notifyUser(promoted, 'ascenso_jefa', { nombre: u.name }, `leader:${promoted}`);
  }
  return result;
}

// Link de pago de Mercado Pago (Checkout Pro). Sin token configurado, devuelve la página de pago de la app.
export async function createPaymentLink(obligationId) {
  const ob = await direct.one(
    `SELECT ob.*, u.name FROM obligations ob JOIN users u ON u.id = ob.seller_id WHERE ob.id = $1`,
    [obligationId],
  );
  if (!ob) throw new AppError('Deuda no encontrada', 404);
  const due = ob.amount + ob.surcharge - ob.paid_principal - ob.paid_surcharge;
  if (!config.mercadopago.accessToken) return { url: paymentLink(obligationId), amount: due, provider: 'app' };
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mercadopago.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: `Pago pedido #${ob.order_id}`, quantity: 1, unit_price: due / 100, currency_id: 'ARS' }],
      external_reference: String(ob.id),
      notification_url: `${config.apiUrl}/api/webhooks/mercadopago`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new AppError(`Mercado Pago: ${body.message ?? res.status}`, 502);
  return { url: body.init_point, amount: due, provider: 'mercadopago' };
}

// Webhook de Mercado Pago: consulta el pago y, si está aprobado, lo acredita una sola vez.
export async function handleMercadoPagoNotification(paymentId) {
  if (!config.mercadopago.accessToken || !paymentId) return { ignored: true };
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.mercadopago.accessToken}` },
  });
  const mp = await res.json();
  if (!res.ok || mp.status !== 'approved') return { ignored: true };
  // Pedidos de la tienda online
  if (String(mp.external_reference ?? '').startsWith('web:')) {
    const { webOrderPaidByMercadoPago } = await import('./checkout.js');
    return webOrderPaidByMercadoPago(mp);
  }
  const ref = `mp:${mp.id}`;
  if (await direct.one('SELECT 1 FROM payments WHERE external_ref = $1', [ref])) return { duplicate: true };
  const ob = await direct.one('SELECT id, seller_id FROM obligations WHERE id = $1', [Number(mp.external_reference)]);
  if (!ob) return { ignored: true };
  const p = await direct.one(
    `INSERT INTO payments (obligation_id, seller_id, amount, method, external_ref) VALUES ($1, $2, $3, 'mercadopago', $4)
     ON CONFLICT (external_ref) DO NOTHING RETURNING id`,
    [ob.id, ob.seller_id, Math.round(mp.transaction_amount * 100), ref],
  );
  if (!p) return { duplicate: true };
  return creditPayment(p.id, null);
}
