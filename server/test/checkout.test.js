// Compras de la tienda contra PostgreSQL real. Requiere TEST_DATABASE_URL; si no está, se saltea.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { orderWhatsappText, priceOrder } from '../src/rules/store.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'definí TEST_DATABASE_URL para correr la prueba con base de datos';
let db;
let store;
let checkout;
let wholesale;
let P;

test('precio del pedido: lista para el público, mayorista para mayoristas', () => {
  const products = [
    { id: 1, sku: 'A', name: 'A', list_price: 1000, wholesale_price: 800, cost: 500, active: true },
    { id: 2, sku: 'B', name: 'B', list_price: 2000, wholesale_price: null, cost: null, active: true },
    { id: 3, sku: 'C', name: 'C', list_price: 3000, wholesale_price: 2000, cost: 1000, active: false },
  ];
  const r = priceOrder([{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }, { productId: 1, qty: 1 }], products, { shipping: 300 });
  assert.equal(r.subtotal, 5000);
  assert.equal(r.total, 5300);
  assert.equal(r.costTotal, 1500);
  assert.deepEqual(r.errors, []);
  const w = priceOrder([{ productId: 1, qty: 3 }, { productId: 2, qty: 1 }], products, { wholesale: true });
  assert.equal(w.subtotal, 3 * 800 + 2000, 'sin precio mayorista usa el de lista');
  assert.ok(priceOrder([{ productId: 3, qty: 1 }], products).errors.length, 'producto pausado');
  assert.ok(priceOrder([{ productId: 1, qty: 0 }], products).errors.length);
  assert.ok(priceOrder([], products).errors.length);
});

test('mensaje de WhatsApp corto, sin el detalle', () => {
  assert.equal(orderWhatsappText(null, 42), '¡Hola! Acabo de realizar un pedido por la página (pedido #42). Ya te envío el comprobante.');
});

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/db/index.js');
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { seed } = await import('../src/db/seed.js');
  await seed({ sampleProducts: false });
  store = await import('../src/services/store.js');
  checkout = await import('../src/services/checkout.js');
  wholesale = await import('../src/services/wholesale.js');
  P = await store.saveStoreProduct({ name: 'Rallador', cost: 462000 }, 1); // lista 7.700 (7.623 redondeado), mayorista 7.000
});

after(async () => {
  if (db) await db.pool.end();
});

const customer = { name: 'Ana Pérez', phone: '11 5555 1234', address: 'Calle 123', city: 'Lanús' };

test('pedido por transferencia: precios del servidor, envío por zona, costo y comprobante', { skip }, async () => {
  const zones = (await checkout.publicCheckout()).zones;
  assert.equal(zones.length, 2);
  await assert.rejects(checkout.createOrder({ items: [{ productId: P.id, qty: 2, list_price: 1 }], customer, zoneId: zones[0].id, paymentMethod: 'mercadopago' }), /Mercado Pago no está disponible/);
  const { order, payUrl } = await checkout.createOrder({ items: [{ productId: P.id, qty: 2, list_price: 1 }], customer, zoneId: zones[0].id, paymentMethod: 'transfer' });
  assert.equal(payUrl, null);
  assert.equal(order.subtotal, 2 * P.list_price, 'ignora el precio que manda el navegador');
  assert.equal(order.total, 2 * P.list_price + zones[0].price);
  assert.equal(order.price_type, 'list');
  assert.equal(order.phone, '+541155551234');
  const row = await db.one('SELECT cost_total FROM web_orders WHERE id = $1', [order.id]);
  assert.equal(row.cost_total, 2 * 462000);

  const pub = await checkout.publicOrder(order.public_token);
  assert.equal(pub.items[0].qty, 2);
  assert.match(pub.whatsappText, new RegExp(`pedido #${order.id}`));
  assert.equal(pub.order.cost_total, undefined, 'el costo no se muestra al cliente');
  await checkout.markProofSent(order.public_token);
  assert.equal((await checkout.publicOrder(order.public_token)).order.payment_status, 'proof_sent');
  await assert.rejects(checkout.publicOrder('no-existe'), /no encontrado/);
  await assert.rejects(checkout.createOrder({ items: [{ productId: P.id, qty: 1 }], customer: { ...customer, address: '' }, zoneId: zones[0].id, paymentMethod: 'transfer' }), /dirección/);
});

test('mayoristas: pendiente sin invitación, habilitado con el enlace, paga precio mayorista', { skip }, async () => {
  const pending = await wholesale.register({ name: 'Bazar Sur', phone: '11 4444 0001', password: 'secreto1' });
  assert.equal(pending.status, 'pending');
  await assert.rejects(wholesale.register({ name: 'Otro', phone: '11 4444 0001', password: 'secreto1' }), /Ya hay una cuenta/);
  const { inviteCode } = await wholesale.newInvite(1);
  const invited = await wholesale.register({ name: 'Deco Norte', phone: '11 4444 0002', password: 'secreto1', invite: inviteCode });
  assert.equal(invited.status, 'active');
  const bad = await wholesale.register({ name: 'Mal', phone: '11 4444 0003', password: 'secreto1', invite: 'viejo' });
  assert.equal(bad.status, 'pending');
  const byAdmin = await wholesale.register({ name: 'Elegida', phone: '11 4444 0004' }, { byAdmin: 1 });
  assert.equal(byAdmin.status, 'active');
  assert.ok(byAdmin.tempPassword);
  await wholesale.setStatus(pending.id, 'active', 1);
  assert.equal((await wholesale.list()).find((c) => c.id === pending.id).status, 'active');

  const q = await checkout.quote([{ productId: P.id, qty: 1 }], { wholesale: true });
  assert.equal(q.subtotal, P.wholesale_price);
  const zone = (await checkout.listZones())[1];
  const { order } = await checkout.createOrder({ items: [{ productId: P.id, qty: 3 }], customer, zoneId: zone.id, paymentMethod: 'transfer' }, { id: invited.id, role: 'wholesale' });
  assert.equal(order.price_type, 'wholesale');
  assert.equal(order.subtotal, 3 * P.wholesale_price);
});

test('pago aprobado de Mercado Pago marca el pedido una sola vez y controla el monto', { skip }, async () => {
  const zone = (await checkout.listZones())[0];
  const { order } = await checkout.createOrder({ items: [{ productId: P.id, qty: 1 }], customer, zoneId: zone.id, paymentMethod: 'transfer' });
  const short = await checkout.webOrderPaidByMercadoPago({ id: 1, external_reference: `web:${order.id}`, transaction_amount: 1 });
  assert.equal(short.ignored, true);
  const ok = await checkout.webOrderPaidByMercadoPago({ id: 2, external_reference: `web:${order.id}`, transaction_amount: order.total / 100 });
  assert.equal(ok.paid, order.id);
  const again = await checkout.webOrderPaidByMercadoPago({ id: 2, external_reference: `web:${order.id}`, transaction_amount: order.total / 100 });
  assert.equal(again.duplicate, true);
});

test('zonas y medios de pago desde el panel', { skip }, async () => {
  const z = await checkout.saveZone({ name: 'CABA', price: 450000, description: 'Todos los barrios' }, 1);
  await checkout.saveZone({ ...z, price: 500000, active: false }, 1);
  assert.ok(!(await checkout.publicCheckout()).zones.some((x) => x.id === z.id), 'zona inactiva no se ofrece');
  await assert.rejects(checkout.saveZone({ name: 'X', price: -1 }, 1), /inválido/);
  await assert.rejects(checkout.saveCheckoutSettings({ mercadopago: false, transfer: false }, 1), /al menos un medio/);
  await assert.rejects(checkout.saveCheckoutSettings({ transfer: true, transferInfo: {} }, 1), /alias o el CBU/);
  const c = await checkout.saveCheckoutSettings({ mercadopago: true, transfer: true, transferInfo: { alias: 'vm.bazar.deco', holder: 'Nadia' } }, 1);
  assert.equal(c.transferInfo.alias, 'vm.bazar.deco');
  await checkout.deleteZone(z.id, 1);
});
