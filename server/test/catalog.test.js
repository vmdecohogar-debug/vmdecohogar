import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog, parseMoney, skuPrefix } from '../src/rules/catalog.js';

const strip = (rows) => rows.map(({ errors, ...r }) => ({ ...r, errors: errors.length }));

test('montos en formato argentino', () => {
  assert.equal(parseMoney('$4.500'), 450000);
  assert.equal(parseMoney('4.500,50'), 450050);
  assert.equal(parseMoney('12000'), 1200000);
  assert.equal(parseMoney('$ 980'), 98000);
  assert.equal(parseMoney(''), null);
});

test('texto libre copiado de WhatsApp', () => {
  const rows = parseCatalog(`
    • Vela de soja 200 g - $4.500 / $6.500
    2) Mantel de lino: $9.800
    Cesto seagrass $ 8.600 sugerido $12.500
    Algo sin precio
  `);
  assert.deepEqual(strip(rows), [
    { name: 'Vela de soja 200 g', price: 450000, suggested_price: 650000, errors: 0 },
    { name: 'Mantel de lino', price: 980000, suggested_price: null, errors: 0 },
    { name: 'Cesto seagrass', price: 860000, suggested_price: 1250000, errors: 0 },
    { name: 'Algo sin precio', price: null, errors: 1 },
  ]);
});

test('CSV o planilla con encabezados', () => {
  const rows = parseCatalog('Nombre;Precio;Sugerido;Stock;Categoría\nFlorero;5.400;7.800;12;Deco\nTaza;6100;8800;;Cocina');
  assert.deepEqual(strip(rows), [
    { name: 'Florero', price: 540000, suggested_price: 780000, stock: 12, category: 'Deco', errors: 0 },
    { name: 'Taza', price: 610000, suggested_price: 880000, stock: null, category: 'Cocina', errors: 0 },
  ]);
});

test('columnas separadas por tabulación (pegado desde Excel) sin encabezado', () => {
  const rows = parseCatalog('Portavelas\t3200\t4600\t30\tVelas');
  assert.deepEqual(strip(rows), [{ name: 'Portavelas', price: 320000, suggested_price: 460000, stock: 30, category: 'Velas', description: null, errors: 0 }]);
});

test('sugerido menor al precio de vendedora es un error', () => {
  assert.equal(parseCatalog('Taza;8000;6000')[0].errors.length, 1);
});

test('prefijo de código', () => {
  assert.equal(skuPrefix({ category: 'Velas' }), 'VEL');
  assert.equal(skuPrefix({ name: 'Té' }), 'TEX');
});
