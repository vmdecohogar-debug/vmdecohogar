// Carga del catálogo del PDF. Requiere TEST_DATABASE_URL; si no está, se saltea.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'definí TEST_DATABASE_URL para correr la prueba con base de datos';
let db;
after(async () => { if (db) await db.pool.end(); });

test('carga los 256 productos del PDF con foto, precios tal cual y una sola vez', { skip }, async () => {
  process.env.DATABASE_URL = url;
  db = await import('../src/db/index.js');
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { seed } = await import('../src/db/seed.js');
  await seed({ catalog: true });
  const n = await db.one(`SELECT COUNT(*)::int AS n, COUNT(image_url)::int AS fotos, COUNT(DISTINCT substring(sku from '^VM-[0-9]+'))::int AS codigos FROM products`);
  assert.equal(n.codigos, 256);
  assert.equal(n.n, 262, '6 productos con dos medidas se cargan como dos productos');
  assert.equal(n.fotos, n.n);
  const p = await db.one(`SELECT p.*, c.name AS cat FROM products p JOIN categories c ON c.id = p.category_id WHERE sku = 'VM-005'`);
  assert.deepEqual([p.cost, p.wholesale_price, p.list_price, p.price_mode, p.cat], [198400, 300000, 350000, 'manual', 'Cocina']);
  const m = await db.one(`SELECT name, list_price FROM products WHERE sku = 'VM-021-2'`);
  assert.equal(m.name, 'Molinillo pimentero de madera Grande 25 a 27 cm');
  assert.equal(m.list_price, 1650000);
  const img = await db.one(`SELECT length(data) AS bytes FROM images WHERE name = 'catalogo-vm-005.jpg'`);
  assert.ok(img.bytes > 10000);
  const sin = await db.one('SELECT COUNT(*)::int AS n FROM products WHERE category_id IS NULL');
  assert.equal(sin.n, 0, 'todos con categoría');
  const { loadCatalog } = await import('../src/db/catalogo.js');
  assert.deepEqual(await loadCatalog(), { skipped: true });
});
