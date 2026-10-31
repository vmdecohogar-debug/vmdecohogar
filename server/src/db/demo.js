// Carga una red de ejemplo para probar los tres paneles: npm run demo
// Contraseña de todas las vendedoras de ejemplo: demo123
import { pool, direct } from './index.js';
import { seed } from './seed.js';
import { addBusinessDays, addDays } from '../rules/index.js';
import { today } from '../config.js';
import { approveSeller, registerSeller } from '../services/sellers.js';
import { closeKit, createKit, createOrder, deliverOrder } from '../services/orders.js';
import { registerPayment } from '../services/payments.js';
import { runDaily } from '../services/daily.js';

const ADMIN = { id: 1, role: 'admin' };
let n = 0;

async function seller(name, code) {
  n++;
  const s = await registerSeller({
    name, dni: `3000000${n}`, phone: `1150000${String(n).padStart(3, '0')}`, password: 'demo123', referralCode: code, whatsappOptIn: true,
    address: `Calle ${n * 10}, Barrio Centro`,
  });
  await approveSeller(s.id, ADMIN.id);
  return s;
}

async function kitPaid(sellerId, productId, qty = 3) {
  const kit = await createKit(sellerId, { items: [{ productId, qty }], deliveryDate: addBusinessDays(today(), 1) });
  await deliverOrder(kit.id, ADMIN.id);
  const { obligation } = await closeKit(kit.id, {}, ADMIN.id);
  await registerPayment({ obligationId: obligation.id, amount: obligation.amount, method: 'cash' }, ADMIN);
}

await seed({ sampleProducts: true });
if ((await direct.one('SELECT COUNT(*)::int AS n FROM sellers')).n > 0) {
  console.log('Ya hay vendedoras cargadas: no se crea la red de ejemplo.');
  await pool.end();
  process.exit(0);
}
const p = Object.fromEntries((await direct.query('SELECT sku, id FROM products')).rows.map((r) => [r.sku, r.id]));

const ana = await seller('Ana Pérez');
const bea = await seller('Beatriz Gómez', ana.referralCode);
await kitPaid(bea.id, p['VEL-001']);
for (const name of ['Carla Díaz', 'Daniela Sosa', 'Elena Ríos', 'Flor Medina', 'Gabriela Luna', 'Hilda Paz', 'Inés Vera', 'Julia Romero', 'Karina Ortiz']) {
  const s = await seller(name, ana.referralCode);
  await kitPaid(s.id, p['SAH-001'], 5);
}

// Carla ya es Bronce: pedido a crédito entregado y vencido hace 5 días (mora).
const carla = await direct.one(`SELECT id FROM users WHERE name = 'Carla Díaz'`);
const { order, obligations } = await createOrder(carla.id, {
  items: [{ productId: p['CES-001'], qty: 5 }, { productId: p['MAN-001'], qty: 2 }], mode: 'credit', deliveryDate: addBusinessDays(today(), 1),
});
await deliverOrder(order.id, ADMIN.id);
await direct.query(`UPDATE obligations SET due_date = $2 WHERE order_id = $1 AND kind = 'credit'`, [order.id, addDays(today(), -5)]);
const onDelivery = obligations.find((o) => o.kind === 'on_delivery');
if (onDelivery) await registerPayment({ obligationId: onDelivery.id, amount: onDelivery.amount, method: 'cash' }, ADMIN);

// Daniela: pedido a crédito que vence en 2 días.
const dani = await direct.one(`SELECT id FROM users WHERE name = 'Daniela Sosa'`);
const o2 = await createOrder(dani.id, { items: [{ productId: p['DIF-001'], qty: 4 }], mode: 'credit', deliveryDate: addBusinessDays(today(), 1) });
await deliverOrder(o2.order.id, ADMIN.id);
await direct.query(`UPDATE obligations SET due_date = $2 WHERE order_id = $1 AND kind = 'credit'`, [o2.order.id, addDays(today(), 2)]);

// Una referida de Beatriz (segundo nivel de Ana) con el kit recién entregado, y un alta pendiente.
const lucia = await seller('Lucía Benítez', bea.referralCode);
const kit = await createKit(lucia.id, { items: [{ productId: p['VEL-001'], qty: 4 }, { productId: p['TAZ-001'], qty: 2 }], deliveryDate: addBusinessDays(today(), 1) });
await deliverOrder(kit.id, ADMIN.id);
await registerSeller({ name: 'María Quiroga', dni: '30000099', phone: '1150000099', password: 'demo123', referralCode: ana.referralCode, whatsappOptIn: true });

// La jefa zonal cobró efectivo y falta rendirlo.
await registerPayment({ sellerId: carla.id, amount: 2000000, method: 'cash' }, { id: ana.id, role: 'seller' });

console.log(await runDaily());
console.log(`Red de ejemplo lista.
  Admin:       11 0000 0000 / admin123
  Jefa zonal:  11 5000 0001 (Ana) / demo123
  Vendedora:   11 5000 0003 (Carla, en mora) / demo123`);
await pool.end();
