import { randomBytes } from 'node:crypto';
import { direct, tx } from '../db/index.js';
import { parseCatalog, skuPrefix, validateRow } from '../rules/catalog.js';
import { AppError, audit } from './common.js';

const FIELDS = 'id, sku, name, description, category, image_url, price, suggested_price, stock, active, updated_at';

export async function listProducts({ includeInactive = false } = {}) {
  const { rows } = await direct.query(
    `SELECT ${FIELDS} FROM products ${includeInactive ? '' : 'WHERE active'} ORDER BY category NULLS LAST, name`,
  );
  return rows;
}

export async function listCategories() {
  const { rows } = await direct.query(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category`);
  return rows.map((r) => r.category);
}

async function nextSku(db, row) {
  const prefix = skuPrefix(row);
  const r = await db.one(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(sku, '^${prefix}-', ''), sku)::int), 0) + 1 AS n
       FROM products WHERE sku ~ '^${prefix}-[0-9]+$'`,
  );
  return `${prefix}-${String(r.n).padStart(3, '0')}`;
}

function clean(data) {
  const row = {
    name: data.name?.trim() || null,
    description: data.description?.trim() || null,
    category: data.category?.trim() || null,
    image_url: data.image_url || null,
    price: data.price == null ? null : Math.round(Number(data.price)),
    suggested_price: data.suggested_price == null || data.suggested_price === '' ? null : Math.round(Number(data.suggested_price)),
    stock: data.stock == null || data.stock === '' ? null : Number(data.stock),
    sku: data.sku?.trim().toUpperCase() || null,
  };
  const { errors } = validateRow(row);
  if (errors.length) throw new AppError(errors.join(' '));
  return row;
}

// Alta o edición de un producto. Sin código, se genera uno.
export async function saveProduct(data, adminId) {
  const row = clean(data);
  return tx(async (db) => {
    let p;
    if (data.id) {
      p = await db.one(
        `UPDATE products SET name = $2, description = $3, category = $4, image_url = $5, price = $6,
                suggested_price = $7, stock = COALESCE($8, stock), sku = COALESCE($9, sku), updated_at = now()
          WHERE id = $1 RETURNING ${FIELDS}`,
        [data.id, row.name, row.description, row.category, row.image_url, row.price, row.suggested_price ?? row.price, row.stock, row.sku],
      );
      if (!p) throw new AppError('Producto no encontrado', 404);
    } else {
      const sku = row.sku ?? (await nextSku(db, row));
      if (await db.one('SELECT 1 FROM products WHERE sku = $1', [sku])) throw new AppError(`Ya existe un producto con el código ${sku}.`, 409);
      p = await db.one(
        `INSERT INTO products (sku, name, description, category, image_url, price, suggested_price, stock)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${FIELDS}`,
        [sku, row.name, row.description, row.category, row.image_url, row.price, row.suggested_price ?? row.price, row.stock ?? 0],
      );
    }
    await audit(db, adminId, data.id ? 'update' : 'create', 'product', p.id, row);
    return p;
  });
}

export async function setProductActive(id, active, adminId) {
  const p = await direct.one(`UPDATE products SET active = $2, updated_at = now() WHERE id = $1 RETURNING ${FIELDS}`, [id, !!active]);
  if (!p) throw new AppError('Producto no encontrado', 404);
  await audit(direct, adminId, active ? 'activate' : 'pause', 'product', id);
  return p;
}

// Vista previa de una lista pegada: marca cuáles productos ya existen (por código o por nombre).
export async function previewImport(text) {
  const rows = parseCatalog(text);
  const out = [];
  for (const r of rows) {
    const existing = r.sku
      ? await direct.one('SELECT id, sku, name FROM products WHERE sku = $1', [r.sku.toUpperCase()])
      : r.name && (await direct.one('SELECT id, sku, name FROM products WHERE lower(name) = lower($1)', [r.name]));
    out.push({ ...r, existingId: existing?.id ?? null, existingSku: existing?.sku ?? null });
  }
  return out;
}

// Importa las filas válidas: actualiza las que ya existen y crea las nuevas, todo o nada.
export async function importProducts(text, adminId) {
  const rows = await previewImport(text);
  const valid = rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) throw new AppError('No hay filas válidas para importar.');
  return tx(async (db) => {
    let created = 0;
    let updated = 0;
    for (const r of valid) {
      if (r.existingId) {
        await db.query(
          `UPDATE products SET price = $2, suggested_price = COALESCE($3, suggested_price), stock = COALESCE($4, stock),
                  category = COALESCE($5, category), description = COALESCE($6, description), active = true, updated_at = now()
            WHERE id = $1`,
          [r.existingId, r.price, r.suggested_price, r.stock, r.category, r.description],
        );
        updated++;
      } else {
        const sku = r.sku?.toUpperCase() ?? (await nextSku(db, r));
        await db.query(
          `INSERT INTO products (sku, name, description, category, price, suggested_price, stock) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sku, r.name, r.description ?? null, r.category ?? null, r.price, r.suggested_price ?? r.price, r.stock ?? 0],
        );
        created++;
      }
    }
    await audit(db, adminId, 'import', 'product', null, { created, updated, skipped: rows.length - valid.length });
    return { created, updated, skipped: rows.length - valid.length };
  });
}

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Guarda una foto enviada como data URL (la app la achica antes de subirla) en la base de datos.
export async function saveImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) throw new AppError('Formato de imagen no válido (usá JPG, PNG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new AppError('La foto pesa más de 3 MB.');
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${IMAGE_TYPES[m[1]]}`;
  await direct.query('INSERT INTO images (name, mime, data) VALUES ($1, $2, $3)', [name, m[1], buf]);
  return { url: `/uploads/${name}` };
}

// Foto guardada en la base (las anteriores pueden estar en disco: las sirve express.static).
export async function getImage(name) {
  return direct.one('SELECT mime, data FROM images WHERE name = $1', [name]);
}
