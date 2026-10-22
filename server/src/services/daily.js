import { direct, tx } from '../db/index.js';
import { today as todayFn } from '../config.js';
import * as R from '../rules/index.js';
import { getLevels, getSettings, leaderFor, paymentLink } from './common.js';
import { notifyUser } from './whatsapp.js';

async function openAlert(db, { type, sellerId, recipientId, obligationId, note }) {
  await db.query(
    `INSERT INTO alerts (type, seller_id, recipient_id, obligation_id, note, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING`,
    [type, sellerId, recipientId, obligationId, note, `${type}:${obligationId}:${recipientId ?? 'admin'}`],
  );
}

// Proceso diario: recordatorios, avisos de atraso, alertas a la jefa zonal, recargo, bajada de nivel
// y seguimiento del kit. Es idempotente: correrlo dos veces el mismo día no repite nada.
export async function runDaily(day = todayFn()) {
  const settings = await getSettings();
  const levels = await getLevels();
  const cfg = settings.mora;
  const summary = { day, obligations: 0, messages: 0, alerts: 0, surcharges: 0, levelDowns: 0, kitFollowUps: 0 };

  const { rows: obs } = await direct.query(
    `SELECT ob.*, u.name, s.level_code FROM obligations ob
       JOIN users u ON u.id = ob.seller_id JOIN sellers s ON s.user_id = ob.seller_id
      WHERE ob.status IN ('pending', 'bad_debt') AND ob.kind <> 'upfront' AND ob.due_date IS NOT NULL`,
  );

  for (const ob of obs) {
    summary.obligations++;
    const actions = R.moraActions({ dueDate: ob.due_date, today: day }, cfg);
    if (!actions.length) continue;
    const late = R.daysLate(ob.due_date, day);
    await tx(async (db) => {
      await db.query('UPDATE obligations SET max_days_late = GREATEST(max_days_late, $2) WHERE id = $1', [ob.id, late]);
      let surcharge = ob.surcharge;
      if (actions.includes('surcharge') && ob.surcharge === 0 && cfg.surchargePct > 0) {
        surcharge = R.pctOf(ob.amount - ob.paid_principal, cfg.surchargePct);
        await db.query('UPDATE obligations SET surcharge = $2 WHERE id = $1', [ob.id, surcharge]);
        summary.surcharges++;
      }
      const owed = R.formatPesos(ob.amount + surcharge - ob.paid_principal - ob.paid_surcharge);
      const link = paymentLink(ob.id);
      const send = async (template, vars, key, to = ob.seller_id) => {
        const r = await notifyUser(to, template, vars, `ob:${ob.id}:${key}`, db);
        if (!r.skipped) summary.messages++;
      };

      if (actions.includes('reminder')) await send('recordatorio_vencimiento', { nombre: ob.name, monto: owed, fecha: ob.due_date, link }, 'reminder');
      if (actions.includes('due_today')) await send('vence_hoy', { nombre: ob.name, monto: owed, link }, 'due_today');
      if (actions.includes('late_notice') && late < cfg.blockDay) await send('aviso_atraso', { nombre: ob.name, monto: owed, dias: late, link }, 'late');
      if (actions.includes('block')) {
        await send('bloqueo_pedidos', { nombre: ob.name, monto: owed, recargo: R.formatPesos(surcharge), link }, 'block');
      }
      if (actions.includes('leader_alert')) {
        const leaderId = await leaderFor(ob.seller_id, db);
        if (leaderId) {
          await openAlert(db, { type: 'mora', sellerId: ob.seller_id, recipientId: leaderId, obligationId: ob.id, note: `${late} días de atraso` });
          const leader = await db.one('SELECT name FROM users WHERE id = $1', [leaderId]);
          await send('alerta_jefa_mora', { jefa: leader.name, vendedora: ob.name, monto: owed, dias: late }, 'leader', leaderId);
          summary.alerts++;
        }
      }
      if (actions.includes('admin_alert')) {
        await openAlert(db, { type: 'mora_admin', sellerId: ob.seller_id, recipientId: null, obligationId: ob.id, note: `${late} días de atraso` });
      }
      if (actions.includes('level_down')) {
        const target = R.levelAfterLateness({ currentCode: ob.level_code, daysLate: late }, levels, cfg);
        const key = actions.includes('bad_debt') ? 'reset' : 'down';
        const already = await db.one(`SELECT 1 FROM alerts WHERE dedupe_key = $1`, [`level_${key}:${ob.id}:admin`]);
        if (!already && target !== ob.level_code) {
          await db.query('UPDATE sellers SET level_code = $2, clean_streak = 0 WHERE user_id = $1', [ob.seller_id, target]);
          summary.levelDowns++;
        }
        await openAlert(db, { type: `level_${key}`, sellerId: ob.seller_id, recipientId: null, obligationId: ob.id, note: `Nivel: ${target}` });
      }
      if (actions.includes('bad_debt') && ob.status !== 'bad_debt') {
        await db.query(`UPDATE obligations SET status = 'bad_debt' WHERE id = $1`, [ob.id]);
      }
    });
  }

  // Kit de arranque: a los N días de entregado, preguntar si quiere cambiar o agregar productos.
  const followUp = R.addDays(day, -settings.kit.followUpDays);
  const { rows: kits } = await direct.query(
    `SELECT o.id, o.seller_id, u.name FROM orders o JOIN users u ON u.id = o.seller_id
      WHERE o.kind = 'kit' AND o.status = 'delivered' AND o.delivered_at::date <= $1`,
    [followUp],
  );
  for (const k of kits) {
    const r = await notifyUser(k.seller_id, 'kit_cambios', { nombre: k.name }, `kit:${k.id}:followup`);
    if (!r.skipped) summary.kitFollowUps++;
  }
  return summary;
}
