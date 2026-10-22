import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules/index.js';

const levels = [
  { code: 'inicial', rank: 0, credit_limit: 0, term_days: 0, early_discount_pct: 0, required_clean_orders: 0 },
  { code: 'bronce', rank: 1, credit_limit: 7500000, term_days: 7, early_discount_pct: 5, required_clean_orders: 0 },
  { code: 'plata', rank: 2, credit_limit: 12500000, term_days: 10, early_discount_pct: 5, required_clean_orders: 3 },
  { code: 'oro', rank: 3, credit_limit: 20000000, term_days: 15, early_discount_pct: 5, required_clean_orders: 6 },
];
const lv = (c) => levels.find((l) => l.code === c);
const mora = { reminderDaysBefore: 3, leaderAlertDay: 4, surchargeDay: 4, surchargeDailyPct: 0.5, surchargeMaxPct: 15, blockDay: 4, adminAlertDay: 7, levelDownDay: 15, badDebtDay: 30, lateToleranceDays: 3 };
const com = { tier1Pct: 3, tier2Pct: 1, minActiveToEarn: 5, minActiveForLeader: 10, activeWindowDays: 30 };

test('entrega en 1 a 3 días hábiles salta el fin de semana', () => {
  // 2026-10-23 es viernes
  assert.deepEqual(R.deliveryOptions('2026-10-23', { minBusinessDays: 1, maxBusinessDays: 3 }), ['2026-10-26', '2026-10-27', '2026-10-28']);
});

test('kit: hasta 10 productos o $50.000', () => {
  const cfg = { maxUnits: 10, maxAmount: 5000000 };
  assert.equal(R.validateKit([{ qty: 10, unit_price: 400000 }], cfg).ok, true);
  assert.equal(R.validateKit([{ qty: 11, unit_price: 100000 }], cfg).ok, false);
  assert.equal(R.validateKit([{ qty: 3, unit_price: 2000000 }], cfg).ok, false);
});

test('pago antes de recibir tiene 5% de descuento', () => {
  const r = R.priceOrder({ subtotal: 10000000, mode: 'prepaid', level: lv('bronce'), available: 0 });
  assert.equal(r.discount, 500000);
  assert.equal(r.upfrontPart, 9500000);
});

test('a crédito, lo que excede el cupo se paga contra entrega', () => {
  const r = R.priceOrder({ subtotal: 10000000, mode: 'credit', level: lv('bronce'), available: 7500000 });
  assert.equal(r.discount, 0);
  assert.equal(r.creditPart, 7500000);
  assert.equal(r.onDeliveryPart, 2500000);
});

test('nivel Inicial no puede pedir a crédito', () => {
  assert.throws(() => R.priceOrder({ subtotal: 100, mode: 'credit', level: lv('inicial'), available: 0 }));
});

test('cupo disponible descuenta lo adeudado y respeta el cupo manual', () => {
  assert.equal(R.availableCredit(lv('plata'), null, 5000000), 7500000);
  assert.equal(R.availableCredit(lv('plata'), 3000000, 5000000), 0);
});

test('acciones de mora por día', () => {
  const due = '2026-11-10';
  assert.deepEqual(R.moraActions({ dueDate: due, today: '2026-11-07' }, mora), ['reminder']);
  assert.deepEqual(R.moraActions({ dueDate: due, today: '2026-11-10' }, mora), ['due_today']);
  assert.deepEqual(R.moraActions({ dueDate: due, today: '2026-11-13' }, mora), ['late_notice']);
  assert.deepEqual(R.moraActions({ dueDate: due, today: '2026-11-14' }, mora), ['late_notice', 'leader_alert', 'surcharge', 'block']);
  assert.ok(R.moraActions({ dueDate: due, today: '2026-12-10' }, mora).includes('bad_debt'));
});

test('el pago va primero a capital y luego al recargo', () => {
  const ob = { amount: 1000, paid_principal: 0, surcharge: 30, paid_surcharge: 0 };
  assert.deepEqual(R.allocatePayment(ob, 500), { principal: 500, surcharge: 0, excess: 0, fullyPaid: false });
  assert.deepEqual(R.allocatePayment(ob, 1030), { principal: 1000, surcharge: 30, excess: 0, fullyPaid: true });
  assert.deepEqual(R.allocatePayment(ob, 1100), { principal: 1000, surcharge: 30, excess: 70, fullyPaid: true });
});

test('comisión 3% primer nivel y 1% segundo; tercero no suma', () => {
  const r = R.commissionsFor({ principal: 10000000, chain: [11, 22, 33] }, com);
  assert.deepEqual(r.map((c) => [c.beneficiaryId, c.amount]), [[11, 300000], [22, 100000]]);
});

test('cobra desde 5 activas y es jefa zonal con 10', () => {
  assert.deepEqual(R.leaderStatus(4, com).earnsCommission, false);
  assert.deepEqual(R.leaderStatus(5, com).earnsCommission, true);
  assert.deepEqual(R.leaderStatus(9, com).isLeader, false);
  assert.deepEqual(R.leaderStatus(10, com).isLeader, true);
});

test('subida de nivel: Bronce con el primer pago, Plata con 3 seguidos, Oro con 6', () => {
  assert.equal(R.levelAfterPayment({ currentCode: 'inicial', streak: 0, paidOnTime: true }, levels).code, 'bronce');
  assert.equal(R.levelAfterPayment({ currentCode: 'bronce', streak: 1, paidOnTime: true }, levels).code, 'bronce');
  assert.equal(R.levelAfterPayment({ currentCode: 'bronce', streak: 2, paidOnTime: true }, levels).code, 'plata');
  assert.equal(R.levelAfterPayment({ currentCode: 'plata', streak: 5, paidOnTime: true }, levels).code, 'oro');
  const late = R.levelAfterPayment({ currentCode: 'plata', streak: 5, paidOnTime: false }, levels);
  assert.deepEqual([late.code, late.streak], ['plata', 0]);
});

test('bajada por mora: 15 días baja uno, 30 vuelve a Inicial', () => {
  assert.equal(R.levelAfterLateness({ currentCode: 'oro', daysLate: 15 }, levels, mora), 'plata');
  assert.equal(R.levelAfterLateness({ currentCode: 'bronce', daysLate: 15 }, levels, mora), 'inicial');
  assert.equal(R.levelAfterLateness({ currentCode: 'oro', daysLate: 30 }, levels, mora), 'inicial');
  assert.equal(R.levelAfterLateness({ currentCode: 'oro', daysLate: 10 }, levels, mora), 'oro');
});

test('recargo diario desde el día 4, con tope', () => {
  const principalDue = 10000000;
  assert.equal(R.surchargeFor({ principalDue, daysLate: 3 }, mora), 0);
  assert.equal(R.surchargeFor({ principalDue, daysLate: 4 }, mora), 50000);
  assert.equal(R.surchargeFor({ principalDue, daysLate: 10 }, mora), 350000);
  assert.equal(R.surchargeFor({ principalDue, daysLate: 45 }, mora), 1500000);
  assert.equal(R.surchargeFor({ principalDue, daysLate: 10 }, { ...mora, surchargeDailyPct: 0 }), 0);
});
