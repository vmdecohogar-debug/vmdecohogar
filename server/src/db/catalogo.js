// Carga el catálogo de VM Bazar y Deco (sacado del PDF de precios) con sus fotos.
// Se corre una sola vez: queda marcado en settings. Los productos que ya existen (mismo código) no se tocan.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';
import { slugify } from '../rules/store.js';

const DIR = fileURLToPath(new URL('../../catalogo/', import.meta.url));
const VERSION = 'pdf-2026-10-30';
const NEW_CATEGORIES = { Infantiles: '🧸' };

export async function loadCatalog({ force = false } = {}) {
  const done = await pool.query(`SELECT value FROM settings WHERE key = 'catalog_import'`);
  if (!force && done.rows[0]?.value?.version === VERSION) return { skipped: true };
  const { products } = JSON.parse(await readFile(`${DIR}productos.json`, 'utf8'));
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    for (const [name, icon] of Object.entries(NEW_CATEGORIES)) {
      await client.query(
        `INSERT INTO categories (name, slug, icon, position) SELECT $1, $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories)
          WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower($1))`,
        [name, slugify(name), icon],
      );
    }
    const cats = Object.fromEntries((await client.query('SELECT id, name FROM categories')).rows.map((c) => [c.name.toLowerCase(), c]));
    for (const p of products) {
      let image = null;
      if (p.photo) {
        image = `catalogo-${p.photo.toLowerCase()}`;
        await client.query('INSERT INTO images (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [image, 'image/jpeg', await readFile(`${DIR}fotos/${p.photo}`)]);
      }
      const cat = cats[String(p.category ?? '').toLowerCase()] ?? null;
      // Productos con medidas distintas (chico/grande) se cargan como productos separados: VM-021-1, VM-021-2.
      for (const [i, v] of p.variants.entries()) {
        const many = p.variants.length > 1;
        const sku = many ? `${p.sku}-${i + 1}` : p.sku;
        const name = many && v.label ? `${p.name} ${v.label}` : p.name;
        const r = await client.query(
          `INSERT INTO products (sku, name, description, category, category_id, image_url, cost, list_price, wholesale_price,
                                 price_mode, price, suggested_price, stock, slug)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', $9, $8, 0, $10)
           ON CONFLICT (sku) DO NOTHING RETURNING id`,
          [sku, name, p.description || null, cat?.name ?? null, cat?.id ?? null, image ? `/uploads/${image}` : null,
            v.cost, v.list, v.wholesale, slugify(`${name} ${sku}`)],
        );
        created += r.rowCount;
      }
    }
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('catalog_import', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
      [{ version: VERSION, created, at: new Date().toISOString() }],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { created };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { migrate } = await import('./migrate.js');
  await migrate();
  loadCatalog({ force: process.argv.includes('--force') })
    .then((r) => { console.log('catálogo', r); return pool.end(); }, (err) => { console.error(err); process.exit(1); });
}
