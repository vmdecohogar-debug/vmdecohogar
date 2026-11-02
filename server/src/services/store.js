// Tienda online pública y su administración (categorías, productos con costo y márgenes, banners, apariencia).
import { direct, tx } from '../db/index.js';
import { cleanDiscount, cleanTheme, computePrices, promoPrices, safeLink, slugify } from '../rules/store.js';
import { AppError, audit, getSettings } from './common.js';

// ---------- Ajustes ----------

const DEFAULT_STORE = {
  margins: { list: 65, wholesale: 50 }, rounding: 100, carouselSeconds: 5, contact: {}, social: {}, payments: {}, seo: {},
};

export async function storeSettings(db = direct) {
  const s = await getSettings(db);
  return { store: { ...DEFAULT_STORE, ...(s.store ?? {}) }, theme: s.theme ?? null };
}

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);

export function cleanStore(data) {
  const errors = [];
  const num = (v, min, max, label) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) errors.push(`${label}: tiene que ser un número entre ${min} y ${max}.`);
    return n;
  };
  const store = {
    name: str(data.name, 80) || 'VM Bazar y Deco',
    tagline: str(data.tagline, 160),
    margins: {
      list: num(data.margins?.list, 0, 1000, 'Margen de lista'),
      wholesale: num(data.margins?.wholesale, 0, 1000, 'Margen mayorista'),
    },
    rounding: num(data.rounding ?? 100, 1, 10000, 'Redondeo'),
    whatsapp: str(data.whatsapp, 30).replace(/[^\d+]/g, ''),
    whatsappMessage: str(data.whatsappMessage, 300),
    contact: {
      phone: str(data.contact?.phone, 40), email: str(data.contact?.email, 120), address: str(data.contact?.address, 200),
      city: str(data.contact?.city, 120), hours: str(data.contact?.hours, 200),
    },
    social: Object.fromEntries(['instagram', 'facebook', 'tiktok'].map((k) => [k, safeLink(data.social?.[k]) ?? ''])),
    payments: Object.fromEntries(['mercadopago', 'cards', 'transfer', 'cash'].map((k) => [k, !!data.payments?.[k]])),
    carouselSeconds: num(data.carouselSeconds ?? 5, 2, 60, 'Tiempo del carrusel'),
    dispatchNote: str(data.dispatchNote, 200),
    seo: { title: str(data.seo?.title, 70), description: str(data.seo?.description, 170) },
  };
  if (store.margins.wholesale > store.margins.list) errors.push('El margen mayorista no puede ser mayor al de lista.');
  return { store, errors };
}

export async function saveStoreSettings(data, adminId) {
  const { store, errors } = cleanStore(data ?? {});
  if (errors.length) throw new AppError(errors.join(' '));
  await direct.query(`INSERT INTO settings (key, value) VALUES ('store', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [store]);
  await audit(direct, adminId, 'update', 'settings', null, { key: 'store' });
  return store;
}

export async function saveTheme(data, adminId) {
  const { theme, errors } = cleanTheme(data ?? {});
  if (errors.length) throw new AppError(errors.join(' '));
  await direct.query(`INSERT INTO settings (key, value) VALUES ('theme', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [theme]);
  await audit(direct, adminId, 'update', 'settings', null, { key: 'theme' });
  return theme;
}

// ---------- Categorías ----------

export async function listCategories({ includeInactive = false, db = direct } = {}) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.slug, c.icon, c.position, c.active,
            COALESCE(c.image_url, (SELECT p.image_url FROM products p WHERE p.category_id = c.id AND p.active AND p.image_url IS NOT NULL
                                    ORDER BY p.featured DESC, p.id LIMIT 1)) AS image_url,
            c.image_url AS own_image_url,
            (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.active) AS product_count
       FROM categories c ${includeInactive ? '' : 'WHERE c.active'}
      ORDER BY c.position, c.name`,
  );
  return rows;
}

export async function saveCategory(data, adminId) {
  const name = str(data.name, 60);
  if (!name) throw new AppError('Falta el nombre de la categoría.');
  const slug = slugify(data.slug || name);
  if (!slug) throw new AppError('Nombre de categoría inválido.');
  const icon = str(data.icon, 8) || null;
  const image = data.image_url || null;
  const active = data.active ?? true;
  return tx(async (db) => {
    const dup = await db.one('SELECT id FROM categories WHERE (lower(name) = lower($1) OR slug = $2) AND id IS DISTINCT FROM $3', [name, slug, data.id ?? null]);
    if (dup) throw new AppError(`Ya existe la categoría "${name}".`, 409);
    let c;
    if (data.id) {
      c = await db.one(
        'UPDATE categories SET name = $2, slug = $3, icon = $4, image_url = $5, active = $6 WHERE id = $1 RETURNING *',
        [data.id, name, slug, icon, image, !!active],
      );
      if (!c) throw new AppError('Categoría no encontrada', 404);
      await db.query('UPDATE products SET category = $2 WHERE category_id = $1', [c.id, name]);
    } else {
      c = await db.one(
        `INSERT INTO categories (name, slug, icon, image_url, active, position)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories)) RETURNING *`,
        [name, slug, icon, image, !!active],
      );
    }
    await audit(db, adminId, data.id ? 'update' : 'create', 'category', c.id, { name, icon });
    return c;
  });
}

// Borra la categoría; sus productos quedan sin categoría (no se borran).
export async function deleteCategory(id, adminId) {
  return tx(async (db) => {
    const c = await db.one('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
    if (!c) throw new AppError('Categoría no encontrada', 404);
    const r = await db.query('UPDATE products SET category = NULL WHERE category_id IS NULL AND category = $1', [c.name]);
    await audit(db, adminId, 'delete', 'category', id, { name: c.name });
    return { ok: true, uncategorized: r.rowCount };
  });
}

export async function reorder(table, ids, adminId) {
  if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) throw new AppError('Orden inválido.');
  if (!['categories', 'banners'].includes(table)) throw new AppError('Orden inválido.');
  await tx(async (db) => {
    for (const [i, id] of ids.entries()) await db.query(`UPDATE ${table} SET position = $2 WHERE id = $1`, [id, i + 1]);
    await audit(db, adminId, 'reorder', table, null, { ids });
  });
  return { ok: true };
}

// ---------- Banners ----------

export async function listBanners({ includeInactive = false } = {}) {
  const { rows } = await direct.query(
    `SELECT id, image_url, link, title, subtitle, position, active FROM banners ${includeInactive ? '' : 'WHERE active'} ORDER BY position, id`,
  );
  return rows;
}

export async function saveBanner(data, adminId) {
  if (!data.image_url) throw new AppError('Falta la imagen del banner.');
  if (data.link && !safeLink(data.link)) throw new AppError('El link tiene que empezar con https:// o con / (una página de la tienda).');
  const vals = [data.image_url, safeLink(data.link), str(data.title, 120) || null, str(data.subtitle, 200) || null, data.active ?? true];
  let b;
  if (data.id) {
    b = await direct.one('UPDATE banners SET image_url = $2, link = $3, title = $4, subtitle = $5, active = $6 WHERE id = $1 RETURNING *', [data.id, ...vals]);
    if (!b) throw new AppError('Banner no encontrado', 404);
  } else {
    b = await direct.one(
      `INSERT INTO banners (image_url, link, title, subtitle, active, position)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM banners)) RETURNING *`,
      vals,
    );
  }
  await audit(direct, adminId, data.id ? 'update' : 'create', 'banner', b.id, { link: b.link });
  return b;
}

export async function deleteBanner(id, adminId) {
  const b = await direct.one('DELETE FROM banners WHERE id = $1 RETURNING id', [id]);
  if (!b) throw new AppError('Banner no encontrado', 404);
  await audit(direct, adminId, 'delete', 'banner', id);
  return { ok: true };
}

// ---------- Productos ----------

// Lo que ve el público. El costo nunca sale de acá; el mayorista solo para cuentas habilitadas.
// Con descuento, list_price / wholesale_price ya son los promocionales y *_before los anteriores (para tacharlos).
export const SALE_LIST = 'COALESCE(p.promo_list_price, p.list_price)';
export const SALE_WHOLESALE = 'COALESCE(p.promo_wholesale_price, p.wholesale_price)';
const PUBLIC_FIELDS = `p.id, p.slug, p.sku, p.name, p.description, p.image_url, ${SALE_LIST} AS list_price, ${SALE_WHOLESALE} AS wholesale_price,
  CASE WHEN p.promo_list_price IS NOT NULL THEN p.list_price END AS list_price_before,
  CASE WHEN p.promo_wholesale_price IS NOT NULL THEN p.wholesale_price END AS wholesale_price_before,
  CASE WHEN p.promo_list_price IS NOT NULL THEN p.discount_pct::float END AS discount_pct,
  p.stock, p.featured, p.created_at, c.name AS category_name, c.slug AS category_slug`;

function forViewer(p, showWholesale) {
  const { wholesale_price: w, wholesale_price_before: wb, ...rest } = p;
  return showWholesale ? { ...rest, wholesale_price: w, wholesale_price_before: wb } : rest;
}

// Texto sin tildes para buscar "organizacion" y encontrar "Organización".
const PLAIN = (col) => `translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;

export async function publicProducts({ category, q, sort = 'new', page = 1, limit = 24, showWholesale = false } = {}) {
  const where = ['p.active', 'p.list_price > 0'];
  const params = [];
  let cat = null;
  if (category) {
    cat = await direct.one('SELECT id, name, slug, icon FROM categories WHERE slug = $1 AND active', [category]);
    if (!cat) throw new AppError('Categoría no encontrada', 404);
    params.push(cat.id);
    where.push(`p.category_id = $${params.length}`);
  }
  const words = slugify(q ?? '').split('-').filter(Boolean).slice(0, 6);
  for (const w of words) {
    params.push(`%${w}%`);
    where.push(`(${PLAIN('p.name')} LIKE $${params.length} OR ${PLAIN("coalesce(p.description, '')")} LIKE $${params.length} OR lower(p.sku) LIKE $${params.length})`);
  }
  const order = {
    new: 'p.created_at DESC, p.id DESC', price_asc: `${SALE_LIST}, p.id`, price_desc: `${SALE_LIST} DESC, p.id`, name: 'p.name, p.id',
  }[sort] ?? 'p.created_at DESC, p.id DESC';
  const lim = Math.min(Math.max(Number(limit) || 24, 1), 60);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const whereSql = where.join(' AND ');
  const total = (await direct.one(`SELECT COUNT(*)::int AS n FROM products p WHERE ${whereSql}`, params)).n;
  const { rows } = await direct.query(
    `SELECT ${PUBLIC_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql} ORDER BY ${order} LIMIT ${lim} OFFSET ${offset}`,
    params,
  );
  return { items: rows.map((p) => forViewer(p, showWholesale)), total, page: Math.max(Number(page) || 1, 1), pages: Math.ceil(total / lim), category: cat };
}

export async function publicProduct(slug, { showWholesale = false } = {}) {
  const p = await direct.one(
    `SELECT ${PUBLIC_FIELDS}, p.category_id FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.active AND p.list_price > 0`,
    [slug],
  );
  if (!p) throw new AppError('Producto no encontrado', 404);
  const { rows } = await direct.query(
    `SELECT ${PUBLIC_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active AND p.list_price > 0 AND p.id <> $1 AND p.category_id IS NOT DISTINCT FROM $2
      ORDER BY random() LIMIT 4`,
    [p.id, p.category_id],
  );
  const { category_id: _c, ...product } = p;
  return { product: forViewer(product, showWholesale), related: rows.map((r) => forViewer(r, showWholesale)) };
}

// Inicio: banners, más vendidos, lo nuevo y categorías (el navegador elige 3 al azar en cada visita).
export async function home({ showWholesale = false } = {}) {
  const sold = `(SELECT COALESCE(SUM(oi.qty), 0) FROM web_order_items oi JOIN web_orders o ON o.id = oi.order_id
                  WHERE oi.product_id = p.id AND o.status <> 'cancelled')`;
  const base = `SELECT ${PUBLIC_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active AND p.list_price > 0`;
  const best = (await direct.query(`${base} ORDER BY ${sold} DESC, p.featured DESC, p.created_at DESC LIMIT 8`)).rows;
  const newest = (await direct.query(`${base} ORDER BY p.created_at DESC, p.id DESC LIMIT 8`)).rows;
  return {
    banners: await listBanners(),
    bestSellers: best.map((p) => forViewer(p, showWholesale)),
    newest: newest.map((p) => forViewer(p, showWholesale)),
  };
}

// Datos que necesita cualquier página de la tienda (encabezado, pie, colores).
export async function publicConfig() {
  const { store, theme } = await storeSettings();
  const { margins: _m, rounding: _r, ...pub } = store;
  return { store: pub, theme, categories: (await listCategories()).map(({ own_image_url: _o, ...c }) => c) };
}

// ---------- Productos (administración) ----------

const ADMIN_FIELDS = `p.id, p.sku, p.slug, p.name, p.description, p.image_url, p.cost, p.list_price, p.wholesale_price, p.price_mode,
  p.list_margin, p.wholesale_margin, p.discount_pct::float AS discount_pct, p.promo_list_price, p.promo_wholesale_price, p.category_id, c.name AS category_name, p.stock, p.active, p.featured, p.created_at, p.updated_at`;

export async function adminProducts() {
  const { rows } = await direct.query(
    `SELECT ${ADMIN_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC, p.id DESC`,
  );
  return rows;
}

const cents = (v) => (v == null || v === '' ? null : Math.round(Number(v)));
const pct = (v) => (v == null || v === '' ? null : Number(v));

async function nextSku(db) {
  const r = await db.one(`SELECT COALESCE(MAX(substring(sku from '^VM-([0-9]+)$')::int), 0) + 1 AS n FROM products WHERE sku ~ '^VM-[0-9]+$'`);
  return `VM-${String(r.n).padStart(3, '0')}`;
}

export async function saveStoreProduct(data, adminId) {
  const name = str(data.name, 160);
  if (!name) throw new AppError('Falta el nombre.');
  const row = {
    cost: cents(data.cost),
    price_mode: data.price_mode === 'manual' ? 'manual' : 'margin',
    list_margin: pct(data.list_margin),
    wholesale_margin: pct(data.wholesale_margin),
    list_price: cents(data.list_price),
    wholesale_price: cents(data.wholesale_price),
  };
  for (const k of ['list_margin', 'wholesale_margin']) {
    if (row[k] != null && (!Number.isFinite(row[k]) || row[k] < 0 || row[k] > 1000)) throw new AppError('Margen inválido.');
  }
  const { store } = await storeSettings();
  const prices = computePrices(row, store);
  if (prices.errors.length) throw new AppError(prices.errors.join(' '));
  const discount = cleanDiscount(data.discount_pct);
  if (discount.errors.length) throw new AppError(discount.errors.join(' '));
  const stock = data.stock == null || data.stock === '' ? null : Number(data.stock);
  if (stock != null && (!Number.isInteger(stock) || stock < 0)) throw new AppError('Stock inválido.');

  return tx(async (db) => {
    const cat = data.category_id ? await db.one('SELECT id, name FROM categories WHERE id = $1', [data.category_id]) : null;
    if (data.category_id && !cat) throw new AppError('La categoría no existe.');
    let sku = str(data.sku, 30).toUpperCase() || null;
    if (!data.id && !sku) sku = await nextSku(db);
    if (sku && (await db.one('SELECT 1 FROM products WHERE sku = $1 AND id IS DISTINCT FROM $2', [sku, data.id ?? null]))) {
      throw new AppError(`Ya existe un producto con el código ${sku}.`, 409);
    }
    const values = [
      name, str(data.description, 2000) || null, cat?.id ?? null, cat?.name ?? null, data.image_url || null,
      row.cost, prices.list_price, prices.wholesale_price, row.price_mode, row.list_margin, row.wholesale_margin,
      !!data.featured, stock,
    ];
    let p;
    if (data.id) {
      const cur = await db.one('SELECT sku, discount_pct::float AS discount_pct FROM products WHERE id = $1', [data.id]);
      if (!cur) throw new AppError('Producto no encontrado', 404);
      // Si no mandan el descuento (por ejemplo, desde otra pantalla) se conserva el que tenía.
      const pctNow = data.discount_pct === undefined ? cur.discount_pct : discount.pct;
      const promo = promoPrices({ ...prices, discount_pct: pctNow }, store.rounding);
      if (promo.errors.length) throw new AppError(promo.errors.join(' '));
      const finalSku = sku ?? cur.sku;
      p = await db.one(
        `UPDATE products SET name = $1, description = $2, category_id = $3, category = $4, image_url = $5, cost = $6,
                list_price = $7, wholesale_price = $8, price_mode = $9, list_margin = $10, wholesale_margin = $11, featured = $12,
                stock = COALESCE($13, stock), price = $8, suggested_price = $7, sku = $14, slug = $15,
                discount_pct = $17, promo_list_price = $18, promo_wholesale_price = $19, updated_at = now()
          WHERE id = $16 RETURNING id`,
        [...values, finalSku, slugify(`${name} ${finalSku}`), data.id, pctNow, promo.promo_list_price, promo.promo_wholesale_price],
      );
    } else {
      const promo = promoPrices({ ...prices, discount_pct: discount.pct }, store.rounding);
      if (promo.errors.length) throw new AppError(promo.errors.join(' '));
      p = await db.one(
        `INSERT INTO products (name, description, category_id, category, image_url, cost, list_price, wholesale_price, price_mode,
                               list_margin, wholesale_margin, featured, stock, price, suggested_price, sku, slug,
                               discount_pct, promo_list_price, promo_wholesale_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 0), $8, $7, $14, $15, $16, $17, $18) RETURNING id`,
        [...values, sku, slugify(`${name} ${sku}`), discount.pct, promo.promo_list_price, promo.promo_wholesale_price],
      );
    }
    await audit(db, adminId, data.id ? 'update' : 'create', 'product', p.id, { name, ...row, ...prices, errors: undefined });
    return db.one(`SELECT ${ADMIN_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [p.id]);
  });
}

// Recalcula los precios de todos los productos "por margen" (por ejemplo, después de cambiar los márgenes generales).
// Los cargados a mano no se tocan.
export async function recalcPrices(adminId) {
  const { store } = await storeSettings();
  return tx(async (db) => {
    const { rows } = await db.query(`SELECT id, cost, price_mode, list_margin, wholesale_margin, discount_pct::float AS discount_pct
                                       FROM products WHERE price_mode = 'margin' AND cost > 0`);
    let updated = 0;
    for (const p of rows) {
      const pr = computePrices(p, store);
      if (pr.errors.length) continue;
      const promo = promoPrices({ ...pr, discount_pct: p.discount_pct }, store.rounding);
      await db.query(
        `UPDATE products SET list_price = $2, wholesale_price = $3, price = $3, suggested_price = $2,
                promo_list_price = $4, promo_wholesale_price = $5, updated_at = now() WHERE id = $1`,
        [p.id, pr.list_price, pr.wholesale_price, promo.promo_list_price, promo.promo_wholesale_price],
      );
      updated++;
    }
    await audit(db, adminId, 'recalc', 'product', null, { updated });
    return { updated };
  });
}

// Botón "Descuento" del panel: aplica un % al producto (lista y mayorista) o lo quita con vacío / 0.
export async function setDiscount(id, discountPct, adminId) {
  const { pct, errors } = cleanDiscount(discountPct);
  if (errors.length) throw new AppError(errors.join(' '));
  const { store } = await storeSettings();
  return tx(async (db) => {
    const cur = await db.one('SELECT id, list_price, wholesale_price FROM products WHERE id = $1', [id]);
    if (!cur) throw new AppError('Producto no encontrado', 404);
    if (pct != null && !(cur.list_price > 0)) throw new AppError('El producto no tiene precio de lista.');
    const promo = promoPrices({ ...cur, discount_pct: pct }, store.rounding);
    if (promo.errors.length) throw new AppError(promo.errors.join(' '));
    await db.query(
      'UPDATE products SET discount_pct = $2, promo_list_price = $3, promo_wholesale_price = $4, updated_at = now() WHERE id = $1',
      [id, pct, promo.promo_list_price, promo.promo_wholesale_price],
    );
    await audit(db, adminId, pct == null ? 'discount_off' : 'discount_on', 'product', id, { discount_pct: pct, ...promo, errors: undefined });
    return db.one(`SELECT ${ADMIN_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [id]);
  });
}

export async function storeCounts() {
  return direct.one(
    `SELECT (SELECT COUNT(*)::int FROM products WHERE active) AS products,
            (SELECT COUNT(*)::int FROM products WHERE active AND category_id IS NULL) AS uncategorized,
            (SELECT COUNT(*)::int FROM products WHERE active AND image_url IS NULL) AS without_photo,
            (SELECT COUNT(*)::int FROM categories WHERE active) AS categories,
            (SELECT COUNT(*)::int FROM banners WHERE active) AS banners,
            (SELECT COUNT(*)::int FROM web_orders WHERE status = 'new') AS new_orders,
            (SELECT COUNT(*)::int FROM web_orders WHERE payment_status = 'proof_sent' AND status <> 'cancelled') AS to_confirm`,
  );
}
