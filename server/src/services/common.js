import { config } from '../config.js';
import { direct } from '../db/index.js';
import { addDays, availableCredit, toDateOnly } from '../rules/index.js';

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getSettings(db = direct) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getLevels(db = direct) {
  const { rows } = await db.query('SELECT * FROM levels ORDER BY rank');
  return rows;
}

export async function audit(db, actorId, action, entity, entityId, data) {
  await db.query('INSERT INTO audit_log (actor_id, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5)', [
    actorId ?? null, action, entity, entityId ?? null, data ?? null,
  ]);
}

export async function getSeller(sellerId, db = direct) {
  const s = await db.one(
    `SELECT s.*, u.name, u.phone, u.status, u.whatsapp_opt_in_at, l.name AS level_name, l.rank AS level_rank,
            l.credit_limit, l.term_days, l.early_discount_pct, l.required_clean_orders
       FROM sellers s JOIN users u ON u.id = s.user_id JOIN levels l ON l.code = s.level_code
      WHERE s.user_id = $1`,
    [sellerId],
  );
  if (!s) throw new AppError('Vendedora no encontrada', 404);
  return s;
}

export function levelOf(seller) {
  return {
    code: seller.level_code,
    rank: seller.level_rank,
    credit_limit: seller.credit_limit,
    term_days: seller.term_days,
    early_discount_pct: seller.early_discount_pct,
    required_clean_orders: seller.required_clean_orders,
  };
}

// Deuda a crédito pendiente (lo que ocupa cupo).
export async function outstandingCredit(sellerId, db = direct) {
  const r = await db.one(
    `SELECT COALESCE(SUM(amount - paid_principal), 0) AS v FROM obligations
      WHERE seller_id = $1 AND kind = 'credit' AND status IN ('pending', 'bad_debt')`,
    [sellerId],
  );
  return r.v;
}

export async function availableCreditFor(seller, db = direct) {
  return availableCredit(levelOf(seller), seller.credit_limit_override, await outstandingCredit(seller.user_id, db));
}

// Deuda vencida hace blockDay días o más: bloquea pedidos nuevos.
export async function blockingDebt(sellerId, today, moraCfg, db = direct) {
  const limit = addDays(today, -moraCfg.blockDay);
  const r = await db.one(
    `SELECT COUNT(*)::int AS n FROM obligations
      WHERE seller_id = $1 AND status IN ('pending', 'bad_debt') AND kind <> 'upfront' AND due_date <= $2`,
    [sellerId, limit],
  );
  return r.n > 0;
}

// Referidora directa y su referidora (los dos niveles que cobran comisión).
export async function referralChain(sellerId, db = direct) {
  const s1 = await db.one('SELECT referred_by FROM sellers WHERE user_id = $1', [sellerId]);
  if (!s1?.referred_by) return [];
  const s2 = await db.one('SELECT referred_by FROM sellers WHERE user_id = $1', [s1.referred_by]);
  return s2?.referred_by ? [s1.referred_by, s2.referred_by] : [s1.referred_by];
}

// Jefa zonal a la que se avisa: la primera jefa subiendo por la cadena de referidas.
export async function leaderFor(sellerId, db = direct) {
  const r = await db.one(
    `WITH RECURSIVE up AS (
       SELECT s.referred_by AS id, 1 AS depth FROM sellers s WHERE s.user_id = $1
       UNION ALL
       SELECT s.referred_by, up.depth + 1 FROM sellers s JOIN up ON s.user_id = up.id WHERE up.depth < 20
     )
     SELECT s.user_id FROM up JOIN sellers s ON s.user_id = up.id WHERE s.is_leader ORDER BY up.depth LIMIT 1`,
    [sellerId],
  );
  return r?.user_id ?? null;
}

// Referidas directas activas: con un pago acreditado en los últimos N días.
export async function activeDirectCount(sellerId, asOf, windowDays, db = direct) {
  const from = addDays(asOf, -windowDays);
  const r = await db.one(
    `SELECT COUNT(DISTINCT s.user_id)::int AS n
       FROM sellers s JOIN payments p ON p.seller_id = s.user_id
      WHERE s.referred_by = $1 AND p.status = 'credited'
        AND p.credited_at::date > $2 AND p.credited_at::date <= $3`,
    [sellerId, from, toDateOnly(asOf)],
  );
  return r.n;
}

export function paymentLink(obligationId) {
  return `${config.appUrl}/pagar/${obligationId}`;
}
