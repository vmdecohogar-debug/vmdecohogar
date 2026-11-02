// Envío por código postal: tarifa tipo moto, distancia y tabla de códigos postales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanShippingSettings, haversineKm, normalizePostalCode, SHIPPING_DEFAULTS, shippingPrice, shippingQuote } from '../src/rules/shipping.js';

process.env.GEOREF_OFF = '1';
const { localitiesFor, quoteShipping } = await import('../src/services/shipping.js');

test('código postal: acepta 4 números o el CPA completo', () => {
  assert.equal(normalizePostalCode('1744'), '1744');
  assert.equal(normalizePostalCode('B1744ABC'), '1744');
  assert.equal(normalizePostalCode(' b 1744 '), '1744');
  assert.equal(normalizePostalCode('174'), null);
  assert.equal(normalizePostalCode('hola'), null);
});

test('tarifa: base + km + margen, mínimo y redondeo hacia arriba a $100', () => {
  const cfg = { ...SHIPPING_DEFAULTS, baseFare: 120000, perKm: 48000, marginPct: 30, minFare: 300000 };
  assert.equal(shippingPrice(10, cfg), 780000); // (1.200 + 4.800) × 1,3 = 7.800
  assert.equal(shippingPrice(10.3, cfg), 798800 > 790000 ? 800000 : 0); // 7.987,2 → 8.000
  assert.equal(shippingPrice(0.5, cfg), 300000, 'envío mínimo');
  assert.equal(shippingPrice(10, { ...cfg, marginPct: 0 }), 600000);
});

test('distancia: línea recta × factor de recorrido, tope de km y envío gratis', () => {
  const caba = { lat: -34.6037, lon: -58.3816 };
  const moreno = { lat: -34.6506, lon: -58.7897 };
  const d = haversineKm(moreno, caba);
  assert.ok(d > 36 && d < 39, `Moreno–Obelisco ≈ 37 km, dio ${d}`);
  const cfg = { ...SHIPPING_DEFAULTS, origin: moreno, maxKm: 40 };
  const near = shippingQuote({ lat: -34.67, lon: -58.7528 }, cfg); // Merlo
  assert.ok(near.available && near.km > 3 && near.km < 6);
  assert.equal(shippingQuote(caba, cfg).available, false, 'más de 40 km recorridos');
  assert.equal(shippingQuote({ lat: -34.67, lon: -58.7528 }, { ...cfg, freeFrom: 1000 }, { subtotal: 5000 }).price, 0);
});

test('panel: limpia valores raros y conserva los anteriores', () => {
  const s = cleanShippingSettings({ baseFare: -5, perKm: '50000', marginPct: 25, mode: 'zones', origin: { lat: 10, lon: -58.7 } });
  assert.equal(s.baseFare, SHIPPING_DEFAULTS.baseFare);
  assert.equal(s.perKm, 50000);
  assert.equal(s.marginPct, 25);
  assert.equal(s.mode, 'zones');
  assert.equal(s.origin.lat, SHIPPING_DEFAULTS.origin.lat, 'latitud fuera de Argentina');
  assert.equal(s.origin.lon, -58.7);
});

test('tabla de códigos postales: localidades del CP, CABA y cálculo sin internet', async () => {
  assert.ok(localitiesFor('1744').some((l) => l.name === 'La Reja'));
  assert.equal(localitiesFor('C1425ABC')[0].name, 'Ciudad Autónoma De Buenos Aires');
  assert.deepEqual(localitiesFor('0000'), []);
  const cfg = { ...SHIPPING_DEFAULTS };
  const q = await quoteShipping({ postalCode: '1722', locality: 'Merlo' }, cfg);
  assert.equal(q.precision, 'codigo');
  assert.ok(q.price >= cfg.minFare);
  await assert.rejects(quoteShipping({ postalCode: '1744' }, cfg), /Elegí tu localidad/);
  await assert.rejects(quoteShipping({ postalCode: '12' }, cfg), /código postal/);
  await assert.rejects(quoteShipping({ postalCode: '9410', locality: localitiesFor('9410')[0]?.name }, cfg), /hasta 40 km/);
});
