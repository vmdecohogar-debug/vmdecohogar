// Panel de pedidos de la tienda contra PostgreSQL real. Requiere TEST_DATABASE_URL; si no está, se saltea.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'definí TEST_DATABASE_URL para correr la prueba con base de datos';
let db;
let checkout;
let web;
let A;
let B;
let zone;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/db/index.js');
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { seed } = await import('../src/db/seed.js');
  await seed({ sampleProducts: false });
  const store = await import('../src/services/store.js');
  checkout = await import('../src/services/checkout.js');
  web = await import('../src/services/weborders.js');
  A = await store.saveStoreProduct({ name: 'Rallador', cost: 462000 }, 1); // lista 7.700, costo 4.620
  B = await store.saveStoreProduct({ name: 'Mantel', price_mode: 'manual', list_price: 500000, wholesale_price: 400000 }, 1); // sin costo
  zone = (await checkout.publicCheckout()).zones[0];
});

after(async () => {
  if (db) await db.pool.end();
});

const customer = { name: 'Ana Pérez', phone: '11 5555 1234', address: 'Calle 123', city: 'Lanús' };
const buy = (items) => checkout.createOrder({ items, customer, zoneId: zone.id, paymentMethod: 'transfer' }).then((r) => r.order);

test('pedidos: lista de compras, ganancia, listo para entrega y total vendido', { skip }, async () => {
  const o1 = await buy([{ productId: A.id, qty: 2 }]);
  const o2 = await buy([{ productId: A.id, qty: 1 }, { productId: B.id, qty: 3 }]);

  const orders = await web.listOrders({ status: 'new' });
  assert.equal(orders.length, 2);
  const first = orders.find((o) => o.id === o1.id);
  assert.equal(first.customer_name, 'Ana Pérez');
  assert.equal(first.address, 'Calle 123');
  assert.equal(first.items.length, 1);
  assert.equal(Number(first.profit), 2 * (770000 - 462000), 'ganancia = productos − costo, sin el envío');
  assert.equal(first.missing_cost, 0);
  assert.equal(orders.find((o) => o.id === o2.id).missing_cost, 1, 'avisa que falta el costo del mantel');

  let list = await web.shoppingList();
  assert.equal(list.units, 6);
  const rallador = list.items.find((i) => i.product_id === A.id);
  assert.equal(rallador.qty, 3);
  assert.equal(rallador.orders, 2);
  assert.equal(Number(rallador.cost), 3 * 462000);
  assert.equal(list.items.find((i) => i.product_id === B.id).missing_cost, true);

  let s = await web.salesSummary();
  assert.equal(s.all.orders, 0);
  assert.equal(s.counts.new, 2);

  // Listo para entrega: sale de la lista de compras y pasa al total vendido.
  const r = await web.setStatus(o1.id, 'ready', 1);
  assert.equal(r.status, 'ready');
  assert.ok(r.ready_at);
  list = await web.shoppingList();
  assert.equal(list.units, 4);
  assert.equal(list.items.find((i) => i.product_id === A.id).qty, 1);
  s = await web.salesSummary();
  assert.equal(s.all.orders, 1);
  assert.equal(Number(s.all.products), 2 * 770000);
  assert.equal(Number(s.all.profit), 2 * (770000 - 462000));
  assert.equal(Number(s.all.total), 2 * 770000 + Number(zone.price));
  assert.equal(s.month.orders, 1);

  // Entregado sigue contando como vendido; cancelado sale de todo.
  await web.setStatus(o1.id, 'delivered', 1);
  assert.equal((await web.salesSummary()).all.orders, 1);
  await assert.rejects(web.setStatus(o1.id, 'cancelled', 1), /no se puede/);
  await web.setStatus(o2.id, 'cancelled', 1);
  assert.equal((await web.shoppingList()).units, 0);
  assert.equal((await web.salesSummary()).counts.cancelled, 1);
  await web.setStatus(o2.id, 'new', 1);
  assert.equal((await web.shoppingList()).units, 4, 'un cancelado se puede reactivar');
  await assert.rejects(web.setStatus(999999, 'ready', 1), /no encontrado/);
});

test('pedidos: confirmar el pago de una transferencia', { skip }, async () => {
  const o = await buy([{ productId: A.id, qty: 1 }]);
  await checkout.markProofSent(o.public_token ?? (await db.one('SELECT public_token FROM web_orders WHERE id = $1', [o.id])).public_token);
  assert.equal((await web.salesSummary()).counts.to_confirm, 1);
  const p = await web.setPayment(o.id, 'paid', 1);
  assert.equal(p.payment_status, 'paid');
  assert.ok(p.paid_at);
  assert.equal((await web.salesSummary()).counts.to_confirm, 0);
  assert.equal((await web.setPayment(o.id, 'pending', 1)).paid_at, null);
  await assert.rejects(web.setPayment(o.id, 'regalado', 1), /inválido/);
});
