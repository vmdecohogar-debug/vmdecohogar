import { direct } from '../db/index.js';
import { today } from '../config.js';
import * as R from '../rules/index.js';
import {
  activeDirectCount, availableCreditFor, blockingDebt, getSeller, getSettings, levelOf, outstandingCredit,
} from './common.js';

const OB_SELECT = `SELECT ob.id, ob.order_id, ob.kind, ob.amount, ob.surcharge, ob.paid_principal, ob.paid_surcharge,
  ob.due_date, ob.status, ob.paid_at, ob.max_days_late,
  (ob.amount + ob.surcharge - ob.paid_principal - ob.paid_surcharge) AS balance FROM obligations ob`;

function decorate(ob, cfg, day) {
  return { ...ob, days_late: R.daysLate(ob.due_date, day), semaphore: R.semaphore({ dueDate: ob.due_date, today: day, status: ob.status }, cfg) };
}

export async function sellerDashboard(sellerId) {
  const day = today();
  const settings = await getSettings();
  const seller = await getSeller(sellerId);
  const level = levelOf(seller);
  const { rows: pending } = await direct.query(`${OB_SELECT} WHERE ob.seller_id = $1 AND ob.status IN ('pending', 'bad_debt') ORDER BY ob.due_date NULLS LAST`, [sellerId]);
  const { rows: payments } = await direct.query(
    `SELECT id, obligation_id, amount, method, status, credited_at, created_at FROM payments WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [sellerId],
  );
  const { rows: orders } = await direct.query(
    `SELECT id, kind, payment_mode, status, subtotal, discount, balance_applied, total, delivery_date, deliver_to, delivered_at, change_request, created_at
       FROM orders WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [sellerId],
  );
  const { rows: referrals } = await direct.query(
    `SELECT u.id, u.name, u.status, s.level_code, u.created_at,
            EXISTS (SELECT 1 FROM payments p WHERE p.seller_id = u.id AND p.status = 'credited'
                     AND p.credited_at::date > $2::date - $3::int) AS active
       FROM sellers s JOIN users u ON u.id = s.user_id WHERE s.referred_by = $1 ORDER BY u.created_at DESC`,
    [sellerId, day, settings.commissions.activeWindowDays],
  );
  const activeDirect = await activeDirectCount(sellerId, day, settings.commissions.activeWindowDays);
  const { v: monthCommission } = await direct.one(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM commissions WHERE beneficiary_id = $1 AND period = $2 AND status = 'pending'`,
    [sellerId, R.periodOf(day)],
  );
  const kit = orders.find((o) => o.kind === 'kit' && o.status !== 'cancelled') ?? null;
  const nextLevel = (await direct.query('SELECT * FROM levels WHERE rank = $1', [seller.level_rank + 1])).rows[0] ?? null;
  return {
    today: day,
    profile: { id: seller.user_id, name: seller.name, phone: seller.phone, status: seller.status, referralCode: seller.referral_code, isLeader: seller.is_leader },
    level: { code: level.code, name: seller.level_name, termDays: level.term_days, discountPct: level.early_discount_pct },
    nextLevel: nextLevel && { name: nextLevel.name, requiredCleanOrders: nextLevel.required_clean_orders, currentStreak: seller.clean_streak },
    credit: {
      limit: R.creditLimit(level, seller.credit_limit_override),
      used: await outstandingCredit(sellerId),
      available: await availableCreditFor(seller),
    },
    balanceCredit: seller.balance_credit,
    blocked: await blockingDebt(sellerId, day, settings.mora),
    pending: pending.map((o) => decorate(o, settings.mora, day)),
    payments,
    orders,
    kit,
    needsKit: seller.level_code === 'inicial' && (!kit || kit.status !== 'settled'),
    referrals,
    network: { activeDirect, ...R.leaderStatus(activeDirect, settings.commissions), monthCommission },
    deliveryOptions: R.deliveryOptions(day, settings.delivery),
    kitRules: settings.kit,
  };
}

// Panel de jefa zonal: sus referidas (nivel 1) y las referidas de ellas (nivel 2).
export async function leaderDashboard(leaderId) {
  const day = today();
  const settings = await getSettings();
  const { rows: members } = await direct.query(
    `SELECT u.id, u.name, u.phone, u.status, s.level_code, s.referred_by,
            CASE WHEN s.referred_by = $1 THEN 1 ELSE 2 END AS tier,
            COALESCE(d.balance, 0) AS balance, d.next_due, COALESCE(d.max_late, 0) AS max_late,
            COALESCE(pm.paid_month, 0) AS paid_month
       FROM sellers s JOIN users u ON u.id = s.user_id
       LEFT JOIN LATERAL (
         SELECT SUM(amount + surcharge - paid_principal - paid_surcharge) AS balance, MIN(due_date) AS next_due,
                MAX(GREATEST(0, $2::date - due_date)) AS max_late
           FROM obligations WHERE seller_id = s.user_id AND status IN ('pending', 'bad_debt') AND kind <> 'upfront'
       ) d ON true
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS paid_month FROM payments
          WHERE seller_id = s.user_id AND status = 'credited' AND to_char(credited_at, 'YYYY-MM') = $3
       ) pm ON true
      WHERE s.referred_by = $1 OR s.referred_by IN (SELECT user_id FROM sellers WHERE referred_by = $1)
      ORDER BY max_late DESC, u.name`,
    [leaderId, day, R.periodOf(day)],
  );
  const cfg = settings.mora;
  const withSemaphore = members.map((m) => ({
    ...m,
    semaphore: m.max_late >= cfg.leaderAlertDay ? 'rojo' : m.max_late > 0 || (m.next_due && R.diffDays(day, m.next_due) <= cfg.reminderDaysBefore) ? 'amarillo' : 'verde',
  }));
  const { rows: alerts } = await direct.query(
    `SELECT a.*, u.name AS seller_name FROM alerts a JOIN users u ON u.id = a.seller_id
      WHERE a.recipient_id = $1 AND a.status <> 'closed' ORDER BY a.created_at DESC`,
    [leaderId],
  );
  const { rows: commissions } = await direct.query(
    `SELECT c.period, c.tier, c.status, SUM(c.amount)::bigint AS amount, SUM(c.base)::bigint AS base, COUNT(*)::int AS payments
       FROM commissions c WHERE c.beneficiary_id = $1 GROUP BY c.period, c.tier, c.status ORDER BY c.period DESC, c.tier`,
    [leaderId],
  );
  const { rows: cashPending } = await direct.query(
    `SELECT p.id, p.amount, p.created_at, u.name AS seller_name FROM payments p JOIN users u ON u.id = p.seller_id
      WHERE p.collected_by = $1 AND p.method = 'cash' AND p.status = 'reported' ORDER BY p.created_at`,
    [leaderId],
  );
  const { rows: deliveries } = await direct.query(
    `SELECT o.id, o.kind, o.total, o.delivery_date, u.name AS seller_name FROM orders o JOIN users u ON u.id = o.seller_id JOIN sellers s ON s.user_id = o.seller_id
      WHERE o.deliver_to = 'leader' AND o.status = 'confirmed' AND (s.referred_by = $1 OR s.referred_by IN (SELECT user_id FROM sellers WHERE referred_by = $1))
      ORDER BY o.delivery_date`,
    [leaderId],
  );
  const activeDirect = await activeDirectCount(leaderId, day, settings.commissions.activeWindowDays);
  return {
    today: day,
    members: withSemaphore,
    totals: {
      tier1: members.filter((m) => m.tier === 1).length,
      tier2: members.filter((m) => m.tier === 2).length,
      owed: members.reduce((s, m) => s + m.balance, 0),
      late: withSemaphore.filter((m) => m.semaphore === 'rojo').length,
    },
    activeDirect,
    status: R.leaderStatus(activeDirect, settings.commissions),
    alerts,
    commissions,
    cashPending,
    deliveries,
  };
}

export async function adminDashboard() {
  const day = today();
  const settings = await getSettings();
  const totals = await direct.one(
    `SELECT
       COALESCE(SUM(amount + surcharge - paid_principal - paid_surcharge) FILTER (WHERE status IN ('pending', 'bad_debt')), 0) AS owed,
       COALESCE(SUM(amount + surcharge - paid_principal - paid_surcharge) FILTER (WHERE status = 'pending' AND due_date < $1), 0) AS overdue,
       COALESCE(SUM(amount + surcharge - paid_principal - paid_surcharge) FILTER (WHERE status = 'bad_debt'), 0) AS bad_debt
     FROM obligations WHERE kind <> 'upfront' OR status = 'pending'`,
    [day],
  );
  const collected = await direct.one(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM payments WHERE status = 'credited' AND to_char(credited_at, 'YYYY-MM') = $1`,
    [R.periodOf(day)],
  );
  const counts = await direct.one(
    `SELECT COUNT(*) FILTER (WHERE u.status = 'active')::int AS active, COUNT(*) FILTER (WHERE u.status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE s.is_leader)::int AS leaders
       FROM sellers s JOIN users u ON u.id = s.user_id`,
  );
  return { today: day, totals: { ...totals, collectedMonth: collected.v }, counts, settings };
}

export async function listObligations({ status = 'open' } = {}) {
  const day = today();
  const settings = await getSettings();
  const where = status === 'paid' ? `ob.status = 'paid'` : `ob.status IN ('pending', 'bad_debt')`;
  const { rows } = await direct.query(
    `${OB_SELECT.replace('FROM obligations ob', ', u.name AS seller_name, u.phone FROM obligations ob JOIN users u ON u.id = ob.seller_id')}
      WHERE ${where} ORDER BY ob.due_date NULLS LAST LIMIT 300`,
  );
  return rows.map((o) => decorate(o, settings.mora, day));
}
