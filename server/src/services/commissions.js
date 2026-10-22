import { direct, tx } from '../db/index.js';
import * as R from '../rules/index.js';
import { AppError, activeDirectCount, audit, getSettings } from './common.js';
import { notifyUser } from './whatsapp.js';

function lastDayOf(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Cierra un mes: quien tuvo al menos 5 referidas activas al cierre cobra sus comisiones;
// el resto se anulan. method: 'balance' (saldo a favor en sus compras) o 'transfer'.
export async function closePeriod(period, adminId, method = 'balance') {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError('Período inválido (AAAA-MM).');
  const settings = await getSettings();
  const cfg = settings.commissions;
  const end = lastDayOf(period);
  const { rows: beneficiaries } = await direct.query(
    `SELECT DISTINCT beneficiary_id FROM commissions WHERE period = $1 AND status = 'pending'`,
    [period],
  );
  const out = [];
  for (const { beneficiary_id: id } of beneficiaries) {
    const active = await activeDirectCount(id, end, cfg.activeWindowDays);
    const earns = R.leaderStatus(active, cfg).earnsCommission;
    const res = await tx(async (db) => {
      if (!earns) {
        await db.query(`UPDATE commissions SET status = 'void' WHERE beneficiary_id = $1 AND period = $2 AND status = 'pending'`, [id, period]);
        return { beneficiaryId: id, active, total: 0, status: 'void' };
      }
      const { v: total } = await db.one(
        `SELECT COALESCE(SUM(amount), 0) AS v FROM commissions WHERE beneficiary_id = $1 AND period = $2 AND status = 'pending'`,
        [id, period],
      );
      const st = await db.one(
        `INSERT INTO settlements (beneficiary_id, period, total, method) VALUES ($1, $2, $3, $4)
         ON CONFLICT (beneficiary_id, period) DO UPDATE SET total = settlements.total + EXCLUDED.total RETURNING *`,
        [id, period, total, method],
      );
      await db.query(
        `UPDATE commissions SET status = 'settled', settlement_id = $3 WHERE beneficiary_id = $1 AND period = $2 AND status = 'pending'`,
        [id, period, st.id],
      );
      if (method === 'balance') {
        await db.query('UPDATE sellers SET balance_credit = balance_credit + $2 WHERE user_id = $1', [id, total]);
        await db.query(`UPDATE settlements SET status = 'paid', paid_at = now() WHERE id = $1`, [st.id]);
      }
      await audit(db, adminId, 'settle', 'settlement', st.id, { period, total, active });
      return { beneficiaryId: id, active, total, status: method === 'balance' ? 'paid' : 'pending', settlementId: st.id };
    });
    if (res.total > 0) {
      const u = await direct.one('SELECT name FROM users WHERE id = $1', [id]);
      await notifyUser(id, 'comision_liquidada', { nombre: u.name, periodo: period, monto: R.formatPesos(res.total) }, `settlement:${id}:${period}`);
    }
    out.push(res);
  }
  return out;
}

export async function markSettlementPaid(settlementId, adminId) {
  const s = await direct.one(`UPDATE settlements SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [settlementId]);
  if (!s) throw new AppError('Liquidación no encontrada o ya pagada.', 404);
  await audit(direct, adminId, 'pay', 'settlement', settlementId);
  return s;
}
