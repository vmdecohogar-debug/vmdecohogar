// Reglas de negocio puras: sin base de datos ni red, para poder testearlas solas.
// Montos en centavos. Fechas como strings 'YYYY-MM-DD' o Date.

const DAY_MS = 86400000;

export function toDateOnly(d) {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return date.toISOString().slice(0, 10);
}

export function addDays(d, n) {
  return toDateOnly(new Date(Date.parse(`${toDateOnly(d)}T00:00:00Z`) + n * DAY_MS));
}

export function diffDays(from, to) {
  return Math.round((Date.parse(`${toDateOnly(to)}T00:00:00Z`) - Date.parse(`${toDateOnly(from)}T00:00:00Z`)) / DAY_MS);
}

export function isBusinessDay(d) {
  const wd = new Date(`${toDateOnly(d)}T00:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function addBusinessDays(d, n) {
  let cur = toDateOnly(d);
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

// Fechas de entrega que la vendedora puede elegir (1 a 3 días hábiles).
export function deliveryOptions(today, { minBusinessDays, maxBusinessDays }) {
  const out = [];
  for (let i = minBusinessDays; i <= maxBusinessDays; i++) out.push(addBusinessDays(today, i));
  return out;
}

export function pctOf(amount, pct) {
  return Math.round((amount * Number(pct)) / 100);
}

export function creditLimit(level, override) {
  return override ?? level.credit_limit;
}

export function availableCredit(level, override, outstandingCredit) {
  return Math.max(0, creditLimit(level, override) - outstandingCredit);
}

// Valida el carrito del kit de arranque: hasta N unidades o hasta un monto, lo que llegue primero.
export function validateKit(items, { maxUnits, maxAmount }) {
  const units = items.reduce((s, i) => s + i.qty, 0);
  const amount = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const errors = [];
  if (units === 0) errors.push('El kit no tiene productos.');
  if (units > maxUnits) errors.push(`El kit admite hasta ${maxUnits} productos.`);
  if (amount > maxAmount) errors.push(`El kit admite hasta $${maxAmount / 100}.`);
  return { ok: errors.length === 0, errors, units, amount };
}

// Calcula cómo se paga un pedido regular.
// mode: 'prepaid' (paga antes de recibir, con descuento), 'on_delivery' o 'credit'.
// En crédito, lo que excede el cupo disponible se paga contra entrega.
export function priceOrder({ subtotal, mode, level, available }) {
  if (!['prepaid', 'on_delivery', 'credit'].includes(mode)) throw new Error(`Forma de pago inválida: ${mode}`);
  if (mode === 'credit' && level.code === 'inicial') throw new Error('El nivel Inicial no tiene cupo de crédito.');
  const discount = mode === 'prepaid' ? pctOf(subtotal, level.early_discount_pct) : 0;
  const total = subtotal - discount;
  if (mode === 'prepaid') return { discount, total, upfrontPart: total, onDeliveryPart: 0, creditPart: 0 };
  if (mode === 'on_delivery') return { discount, total, upfrontPart: 0, onDeliveryPart: total, creditPart: 0 };
  const creditPart = Math.min(total, available);
  return { discount, total, upfrontPart: 0, onDeliveryPart: total - creditPart, creditPart };
}

export function dueDateFor(deliveredAt, level) {
  return addDays(deliveredAt, level.term_days);
}

export function daysLate(dueDate, today) {
  if (!dueDate) return 0;
  return Math.max(0, diffDays(dueDate, today));
}

// Recargo por mora: un % diario por cada día de atraso contado desde el día de recargo (los días de margen no suman), con tope.
// Ej.: 0,5% diario desde el día 4 y tope 15% → al día 4 es 0,5%, al día 10 es 3,5%, desde el día 33 queda en 15%.
export function surchargeFor({ principalDue, daysLate }, cfg) {
  if (!cfg.surchargeDailyPct || daysLate < cfg.surchargeDay || principalDue <= 0) return 0;
  const pct = Math.min((daysLate - cfg.surchargeDay + 1) * Number(cfg.surchargeDailyPct), Number(cfg.surchargeMaxPct ?? Infinity));
  return pctOf(principalDue, pct);
}

// Qué corresponde hacer hoy con una obligación pendiente. Cada acción se ejecuta una sola vez
// (el servicio la deduplica con una clave), así que puede llamarse todos los días sin repetir avisos.
export function moraActions({ dueDate, today }, cfg) {
  if (!dueDate) return [];
  const delta = diffDays(today, dueDate); // días que faltan (negativo = atraso)
  const late = -delta;
  const actions = [];
  if (delta === cfg.reminderDaysBefore) actions.push('reminder');
  if (delta === 0) actions.push('due_today');
  if (late >= 1) actions.push('late_notice');
  if (late >= cfg.leaderAlertDay) actions.push('leader_alert');
  if (late >= cfg.surchargeDay) actions.push('surcharge');
  if (late >= cfg.blockDay) actions.push('block');
  if (late >= cfg.adminAlertDay) actions.push('admin_alert');
  if (late >= cfg.levelDownDay) actions.push('level_down');
  if (late >= cfg.badDebtDay) actions.push('bad_debt');
  return actions;
}

export function semaphore({ dueDate, today, status }, cfg) {
  if (status === 'paid') return 'verde';
  if (!dueDate) return 'verde';
  const delta = diffDays(today, dueDate);
  if (delta < 0 && -delta >= cfg.leaderAlertDay) return 'rojo';
  if (delta <= cfg.reminderDaysBefore) return 'amarillo';
  return 'verde';
}

// Reparte un pago entre capital y recargo. Primero capital: la comisión se calcula solo sobre capital.
export function allocatePayment(obligation, amount) {
  const principalDue = obligation.amount - obligation.paid_principal;
  const surchargeDue = obligation.surcharge - obligation.paid_surcharge;
  const principal = Math.min(amount, principalDue);
  const surcharge = Math.min(amount - principal, surchargeDue);
  const excess = amount - principal - surcharge;
  const fullyPaid = principalDue - principal === 0 && surchargeDue - surcharge === 0;
  return { principal, surcharge, excess, fullyPaid };
}

// Beneficiarias de comisión por un pago: referidora directa (nivel 1) y su referidora (nivel 2).
export function commissionsFor({ principal, chain }, cfg) {
  const out = [];
  if (principal <= 0) return out;
  const [tier1, tier2] = chain;
  if (tier1) out.push({ beneficiaryId: tier1, tier: 1, pct: cfg.tier1Pct, amount: pctOf(principal, cfg.tier1Pct) });
  if (tier2) out.push({ beneficiaryId: tier2, tier: 2, pct: cfg.tier2Pct, amount: pctOf(principal, cfg.tier2Pct) });
  return out;
}

export function leaderStatus(activeDirect, cfg) {
  return {
    earnsCommission: activeDirect >= cfg.minActiveToEarn,
    isLeader: activeDirect >= cfg.minActiveForLeader,
    missingToEarn: Math.max(0, cfg.minActiveToEarn - activeDirect),
    missingToLeader: Math.max(0, cfg.minActiveForLeader - activeDirect),
  };
}

// Nivel que corresponde tras pagar una obligación.
// levels: ordenados por rank. paidOnTime: atraso máximo <= tolerancia.
export function levelAfterPayment({ currentCode, streak, paidOnTime }, levels) {
  const newStreak = paidOnTime ? streak + 1 : 0;
  const byRank = [...levels].sort((a, b) => a.rank - b.rank);
  const current = byRank.find((l) => l.code === currentCode);
  let target = current;
  if (current.code === 'inicial') target = byRank.find((l) => l.rank === 1);
  for (const l of byRank) {
    if (l.rank > target.rank && l.required_clean_orders > 0 && newStreak >= l.required_clean_orders) target = l;
  }
  // Solo se sube de a un nivel por pago.
  if (target.rank > current.rank + 1) target = byRank.find((l) => l.rank === current.rank + 1);
  return { code: target.code, streak: newStreak, changed: target.code !== currentCode };
}

// Bajada por mora: más de levelDownDay baja un nivel; más de badDebtDay vuelve a Inicial.
export function levelAfterLateness({ currentCode, daysLate: late }, levels, cfg) {
  const byRank = [...levels].sort((a, b) => a.rank - b.rank);
  const current = byRank.find((l) => l.code === currentCode);
  if (late >= cfg.badDebtDay) return byRank[0].code;
  if (late >= cfg.levelDownDay && current.rank > 0) return byRank.find((l) => l.rank === current.rank - 1).code;
  return currentCode;
}

export function periodOf(d) {
  return toDateOnly(d).slice(0, 7);
}

export function formatPesos(cents) {
  return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
