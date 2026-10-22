// Prueba de punta a punta contra una base PostgreSQL real.
// Requiere TEST_DATABASE_URL (por ejemplo postgres://postgres@localhost/redvendedora_test); si no está, se saltea.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'definí TEST_DATABASE_URL para correr la prueba con base de datos';
let m;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const { config } = await import('../src/config.js');
  const db = await import('../src/db/index.js');
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { seed } = await import('../src/db/seed.js');
  await seed();
  m = {
    config,
    db,
    sellers: await import('../src/services/sellers.js'),
    orders: await import('../src/services/orders.js'),
    payments: await import('../src/services/payments.js'),
    daily: await import('../src/services/daily.js'),
    commissions: await import('../src/services/commissions.js'),
    dash: await import('../src/services/dashboards.js'),
    R: await import('../src/rules/index.js'),
  };
  config.today = '2026-10-26'; // lunes
});

after(async () => {
  if (m) await m.db.pool.end();
});

const ADMIN = { id: 1, role: 'admin' };
let phoneSeq = 1100000100;

async function newSeller(name, referralCode) {
  const s = await m.sellers.registerSeller({
    name, dni: String(phoneSeq), phone: `11${phoneSeq++}`, password: 'secreto1', referralCode, whatsappOptIn: true,
  });
  await m.sellers.approveSeller(s.id, 1);
  return s;
}

async function product(sku) {
  return m.db.one('SELECT * FROM products WHERE sku = $1', [sku]);
}

// Kit completo: pedido, entrega, cierre quedándose todo y pago en efectivo.
async function kitAndPay(sellerId) {
  const vela = await product('VEL-001');
  const day = m.R.addBusinessDays(m.config.today, 1);
  const kit = await m.orders.createKit(sellerId, { items: [{ productId: vela.id, qty: 2 }], deliveryDate: day });
  await m.orders.deliverOrder(kit.id, 1);
  const { obligation } = await m.orders.closeKit(kit.id, {}, 1);
  await m.payments.registerPayment({ obligationId: obligation.id, amount: obligation.amount, method: 'cash' }, ADMIN);
  return kit;
}

test('flujo completo: kit, comisiones, crédito, mora, ascenso y liquidación', { skip }, async () => {
  const ana = await newSeller('Ana Pérez');
  const bea = await newSeller('Bea Gómez', ana.referralCode);
  const caro = await newSeller('Caro Ruiz', bea.referralCode);

  // Kit: más de 10 productos se rechaza.
  const vela = await product('VEL-001');
  const mantel = await product('MAN-001');
  const sahumerio = await product('SAH-001');
  const tomorrow = m.R.addBusinessDays(m.config.today, 1);
  await assert.rejects(
    m.orders.createKit(caro.id, { items: [{ productId: sahumerio.id, qty: 11 }], deliveryDate: tomorrow }),
    /hasta 10 productos/,
  );
  // Sin kit cerrado no puede hacer pedidos regulares.
  await assert.rejects(
    m.orders.createOrder(caro.id, { items: [{ productId: vela.id, qty: 1 }], mode: 'on_delivery', deliveryDate: tomorrow }),
    /kit de arranque/,
  );

  const kit = await m.orders.createKit(caro.id, {
    items: [{ productId: vela.id, qty: 4 }, { productId: mantel.id, qty: 2 }], deliveryDate: tomorrow,
  });
  assert.equal(kit.total, 4 * 450000 + 2 * 980000);
  await m.orders.deliverOrder(kit.id, 1);

  // A los 5 días: WhatsApp preguntando por cambios.
  m.config.today = '2026-10-31';
  const d1 = await m.daily.runDaily(m.config.today);
  assert.equal(d1.kitFollowUps, 1);

  // Segunda visita: devuelve 1 vela y 1 mantel, agrega 2 sahumerios; paga en efectivo a administración.
  const items = (await m.db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [kit.id])).rows;
  const { kept, obligation } = await m.orders.closeKit(kit.id, {
    returns: [{ itemId: items[0].id, qty: 1 }, { itemId: items[1].id, qty: 1 }],
    additions: [{ productId: sahumerio.id, qty: 2 }],
  }, 1);
  assert.equal(kept, 3 * 450000 + 980000 + 2 * 150000);
  const r = await m.payments.registerPayment({ obligationId: obligation.id, amount: kept, method: 'cash' }, ADMIN);
  assert.equal(r.levelChange.code, 'bronce');

  // Comisiones: 3% a Bea (nivel 1) y 1% a Ana (nivel 2).
  const coms = (await m.db.query('SELECT beneficiary_id, tier, amount FROM commissions ORDER BY tier')).rows;
  assert.deepEqual(coms, [
    { beneficiary_id: bea.id, tier: 1, amount: Math.round(kept * 0.03) },
    { beneficiary_id: ana.id, tier: 2, amount: Math.round(kept * 0.01) },
  ]);

  // Pedido a crédito de $100.000 con cupo Bronce de $75.000: $25.000 contra entrega.
  m.config.today = '2026-11-02'; // lunes
  const cesto = await product('CES-001');
  const vase = await product('FLO-001');
  const deliveryDate = m.R.addBusinessDays(m.config.today, 2);
  const { order, obligations } = await m.orders.createOrder(caro.id, {
    items: [{ productId: cesto.id, qty: 10 }, { productId: vase.id, qty: 2 }], mode: 'credit', deliveryDate,
  });
  const sub = 10 * 860000 + 2 * 540000;
  assert.equal(order.subtotal, sub);
  assert.equal(order.credit_part, 7500000);
  assert.deepEqual(obligations.map((o) => [o.kind, o.amount]), [['on_delivery', sub - 7500000], ['credit', 7500000]]);

  // Pago anticipado: 5% de descuento.
  const pre = await m.orders.createOrder(caro.id, { items: [{ productId: vela.id, qty: 2 }], mode: 'prepaid', deliveryDate });
  assert.equal(pre.order.discount, Math.round(900000 * 0.05));
  await assert.rejects(m.orders.deliverOrder(pre.order.id, 1), /se paga antes de la entrega/);

  m.config.today = deliveryDate;
  await m.orders.deliverOrder(order.id, 1);
  await m.payments.registerPayment({ obligationId: obligations[0].id, amount: obligations[0].amount, method: 'cash' }, ADMIN);
  const credit = await m.db.one('SELECT * FROM obligations WHERE id = $1', [obligations[1].id]);
  assert.equal(credit.due_date, m.R.addDays(deliveryDate, 7)); // Bronce: 7 días

  // Ana pasa a jefa zonal con 10 referidas directas activas (Bea + 9 nuevas).
  await kitAndPay(bea.id);
  for (let i = 0; i < 9; i++) {
    const s = await newSeller(`Vendedora ${i}`, ana.referralCode);
    await kitAndPay(s.id);
  }
  assert.equal((await m.db.one('SELECT is_leader FROM sellers WHERE user_id = $1', [ana.id])).is_leader, true);

  // Mora: recordatorio 3 días antes, aviso al día 1, y al día 4 recargo, bloqueo y alerta a la jefa zonal.
  m.config.today = m.R.addDays(credit.due_date, -3);
  await m.daily.runDaily(m.config.today);
  m.config.today = m.R.addDays(credit.due_date, 4);
  const d4 = await m.daily.runDaily(m.config.today);
  assert.equal(d4.surcharges, 1);
  assert.equal(d4.alerts, 1);
  const again = await m.daily.runDaily(m.config.today);
  assert.equal(again.messages, 0); // idempotente
  const templates = (await m.db.query(`SELECT template FROM messages WHERE dedupe_key LIKE $1 ORDER BY id`, [`ob:${credit.id}:%`])).rows.map((x) => x.template);
  assert.deepEqual(templates, ['recordatorio_vencimiento', 'bloqueo_pedidos', 'alerta_jefa_mora']);
  const leaderView = await m.dash.leaderDashboard(ana.id);
  assert.equal(leaderView.alerts.length, 1);
  assert.equal(leaderView.members.find((x) => x.id === caro.id).semaphore, 'rojo');
  await assert.rejects(
    m.orders.createOrder(caro.id, { items: [{ productId: vela.id, qty: 1 }], mode: 'on_delivery', deliveryDate: m.R.addBusinessDays(m.config.today, 1) }),
    /pago atrasado/,
  );

  // Paga todo con recargo: se cierra la alerta y no sube de nivel (pagó con más de 3 días de atraso).
  const withSurcharge = await m.db.one('SELECT amount + surcharge AS total, surcharge FROM obligations WHERE id = $1', [credit.id]);
  assert.equal(withSurcharge.surcharge, Math.round(7500000 * 0.03));
  await m.payments.registerPayment({ obligationId: credit.id, amount: withSurcharge.total, method: 'transfer' }, ADMIN);
  const caroNow = await m.db.one('SELECT level_code, clean_streak FROM sellers WHERE user_id = $1', [caro.id]);
  assert.deepEqual(caroNow, { level_code: 'bronce', clean_streak: 0 });
  assert.equal((await m.dash.leaderDashboard(ana.id)).alerts.length, 0);
  // La comisión sale solo del capital, no del recargo.
  const lastCom = await m.db.one(`SELECT base FROM commissions c JOIN payments p ON p.id = c.payment_id WHERE p.obligation_id = $1 AND c.tier = 1`, [credit.id]);
  assert.equal(lastCom.base, 7500000);

  // Liquidación de noviembre: Ana (10 activas) cobra como saldo a favor; Bea (1 activa) no llega a 5.
  const res = await m.commissions.closePeriod('2026-11', 1, 'balance');
  const byId = Object.fromEntries(res.map((x) => [x.beneficiaryId, x]));
  assert.equal(byId[bea.id].status, 'void');
  assert.equal(byId[ana.id].status, 'paid');
  assert.ok(byId[ana.id].total > 0);
  const anaBalance = await m.db.one('SELECT balance_credit FROM sellers WHERE user_id = $1', [ana.id]);
  assert.equal(anaBalance.balance_credit, byId[ana.id].total);
});
