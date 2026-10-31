// Tienda online contra PostgreSQL real. Requiere TEST_DATABASE_URL; si no está, se saltea.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'definí TEST_DATABASE_URL para correr la prueba con base de datos';
let store;
let seo;
let db;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/db/index.js');
  await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { seed } = await import('../src/db/seed.js');
  await seed();
  store = await import('../src/services/store.js');
  seo = await import('../src/services/seo.js');
});

after(async () => {
  if (db) await db.pool.end();
});

const ADMIN = 1;

test('categorías iniciales, alta, edición, orden y baja', { skip }, async () => {
  const initial = await store.listCategories();
  assert.deepEqual(initial.map((c) => c.name), ['Cocina', 'Baño', 'Deco', 'Organización', 'Limpieza', 'Belleza', 'Navidad']);
  const c = await store.saveCategory({ name: 'Jardín', icon: '🌿' }, ADMIN);
  assert.equal(c.slug, 'jardin');
  await assert.rejects(store.saveCategory({ name: 'cocina' }, ADMIN), /Ya existe/);
  await store.saveCategory({ id: c.id, name: 'Jardín y exterior', icon: '🌻' }, ADMIN);
  await store.reorder('categories', [c.id, ...initial.map((x) => x.id)], ADMIN);
  const after = await store.listCategories();
  assert.equal(after[0].name, 'Jardín y exterior');
  assert.equal(after[0].slug, 'jardin-y-exterior');
  const p = await store.saveStoreProduct({ name: 'Maceta', cost: 100000, category_id: c.id }, ADMIN);
  await store.deleteCategory(c.id, ADMIN);
  const prods = await store.adminProducts();
  assert.equal(prods.find((x) => x.id === p.id).category_id, null, 'el producto queda sin categoría, no se borra');
});

test('producto por margen: 65% lista y 50% mayorista; a mano se respeta', { skip }, async () => {
  const cocina = (await store.listCategories()).find((c) => c.slug === 'cocina');
  const p = await store.saveStoreProduct({ name: 'Bombonera de silicona', cost: 198400, category_id: cocina.id, description: 'Para bombones' }, ADMIN);
  assert.equal(p.list_price, 330000);
  assert.equal(p.wholesale_price, 300000);
  assert.match(p.sku, /^VM-\d{3}$/);
  assert.equal(p.slug, `bombonera-de-silicona-${p.sku.toLowerCase()}`);

  const m = await store.saveStoreProduct({ name: 'Rallador Noir', sku: 'VM-007', price_mode: 'manual', cost: 462000, list_price: 770000, wholesale_price: 690000, category_id: cocina.id }, ADMIN);
  assert.equal(m.list_price, 770000);
  assert.equal(m.wholesale_price, 690000);
  await assert.rejects(store.saveStoreProduct({ name: 'Otro', sku: 'VM-007', cost: 1000 }, ADMIN), /Ya existe un producto/);

  // Cambio de márgenes generales + recalcular: solo cambian los "por margen".
  const { store: cfg } = await store.storeSettings();
  await store.saveStoreSettings({ ...cfg, margins: { list: 100, wholesale: 60 } }, ADMIN);
  await store.recalcPrices(ADMIN);
  const all = await store.adminProducts();
  assert.equal(all.find((x) => x.id === p.id).list_price, 400000); // $1.984 × 2 = $3.968 → $4.000
  assert.equal(all.find((x) => x.id === m.id).list_price, 770000);
  await store.saveStoreSettings({ ...cfg, margins: { list: 65, wholesale: 50 } }, ADMIN);
  await store.recalcPrices(ADMIN);
  await assert.rejects(store.saveStoreSettings({ ...cfg, margins: { list: 40, wholesale: 50 } }, ADMIN), /mayorista no puede ser mayor/);
});

test('tienda pública: búsqueda sin tildes, categoría, sin costo ni mayorista', { skip }, async () => {
  const r = await store.publicProducts({ q: 'BOMBONERA silicona' });
  assert.equal(r.total, 1);
  const item = r.items[0];
  assert.equal(item.cost, undefined, 'el costo nunca se publica');
  assert.equal(item.wholesale_price, undefined, 'el mayorista solo para cuentas habilitadas');
  assert.equal(item.category_slug, 'cocina');
  const w = await store.publicProducts({ q: 'bombonera', showWholesale: true });
  assert.equal(w.items[0].wholesale_price, 300000);
  const cat = await store.publicProducts({ category: 'cocina' });
  assert.equal(cat.category.name, 'Cocina');
  assert.ok(cat.items.every((x) => x.category_slug === 'cocina'));
  await assert.rejects(store.publicProducts({ category: 'no-existe' }), /no encontrada/);

  const detail = await store.publicProduct(item.slug);
  assert.equal(detail.product.name, 'Bombonera de silicona');
  assert.ok(detail.related.every((x) => x.id !== item.id));

  const h = await store.home();
  assert.ok(h.newest.length > 0 && h.newest.length <= 8);
  assert.ok(h.bestSellers.length <= 8);
  const cfg = await store.publicConfig();
  assert.equal(cfg.store.margins, undefined, 'los márgenes no se publican');
  assert.ok(cfg.theme.light.primary);
});

test('descuento: precio tachado en la tienda, se cobra el promocional y se puede quitar', { skip }, async () => {
  const [item] = (await store.publicProducts({ q: 'bombonera' })).items;
  const d = await store.setDiscount(item.id, 20, ADMIN);
  assert.equal(d.discount_pct, 20);
  assert.equal(d.promo_list_price, 270000); // $3.300 − 20% = $2.640 → $2.700
  assert.equal(d.promo_wholesale_price, 240000); // $3.000 − 20% = $2.400
  assert.equal(d.list_price, 330000, 'el precio normal no se pisa');

  const pub = (await store.publicProducts({ q: 'bombonera' })).items[0];
  assert.equal(pub.list_price, 270000);
  assert.equal(pub.list_price_before, 330000);
  assert.equal(pub.discount_pct, 20);
  assert.equal(pub.wholesale_price_before, undefined);
  const w = (await store.publicProducts({ q: 'bombonera', showWholesale: true })).items[0];
  assert.equal(w.wholesale_price, 240000);
  assert.equal(w.wholesale_price_before, 300000);

  const checkout = await import('../src/services/checkout.js');
  const q = await checkout.quote([{ productId: item.id, qty: 2 }]);
  assert.equal(q.subtotal, 540000, 'se cobra el precio promocional');
  const qw = await checkout.quote([{ productId: item.id, qty: 1 }], { wholesale: true });
  assert.equal(qw.subtotal, 240000);

  // Guardar el producto desde el formulario sin tocar el descuento lo conserva; cambiar el costo lo recalcula.
  const kept = await store.saveStoreProduct({ ...d, cost: 198400 }, ADMIN);
  assert.equal(kept.promo_list_price, 270000);
  const { discount_pct: _d, ...noDiscount } = d;
  const kept2 = await store.saveStoreProduct({ ...noDiscount, cost: 300000 }, ADMIN);
  assert.equal(kept2.list_price, 500000); // $3.000 × 1,65 = $4.950 → $5.000
  assert.equal(kept2.promo_list_price, 400000);
  await store.saveStoreProduct({ ...kept2, cost: 198400 }, ADMIN);

  await assert.rejects(store.setDiscount(item.id, 120, ADMIN), /entre 1 y 99/);
  const off = await store.setDiscount(item.id, null, ADMIN);
  assert.equal(off.discount_pct, null);
  assert.equal(off.promo_list_price, null);
  const back = (await store.publicProducts({ q: 'bombonera' })).items[0];
  assert.equal(back.list_price, 330000);
  assert.equal(back.list_price_before, null);
});

test('banners: link seguro, orden y baja', { skip }, async () => {
  const [navidad] = await store.listBanners();
  assert.equal(navidad.link, '/categoria/navidad', 'banner de Navidad cargado de entrada');
  await store.deleteBanner(navidad.id, ADMIN);
  const a = await store.saveBanner({ image_url: '/uploads/a.jpg', link: '/categoria/cocina', title: 'Ofertas' }, ADMIN);
  const b = await store.saveBanner({ image_url: '/uploads/b.jpg' }, ADMIN);
  await assert.rejects(store.saveBanner({ image_url: '/uploads/c.jpg', link: 'javascript:alert(1)' }, ADMIN), /link/);
  await store.reorder('banners', [b.id, a.id], ADMIN);
  assert.deepEqual((await store.listBanners()).map((x) => x.id), [b.id, a.id]);
  await store.saveBanner({ ...a, active: false }, ADMIN);
  assert.deepEqual((await store.listBanners()).map((x) => x.id), [b.id]);
  await store.deleteBanner(b.id, ADMIN);
  assert.equal((await store.listBanners({ includeInactive: true })).length, 1);
});

test('SEO: título, descripción y datos de producto para Google', { skip }, async () => {
  const [p] = (await store.publicProducts({ q: 'bombonera' })).items;
  const meta = await seo.pageMeta(`/producto/${p.slug}`, 'https://vmbazar.com.ar');
  assert.equal(meta.title, 'Bombonera de silicona | VM Bazar y Deco');
  const html = seo.injectMeta('<head><!--seo--><title>x</title><!--/seo--></head>', meta);
  assert.match(html, /<title>Bombonera de silicona \| VM Bazar y Deco<\/title>/);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"price":"3300.00","priceCurrency":"ARS"/);
  assert.match(html, /rel="canonical" href="https:\/\/vmbazar.com.ar\/producto\//);
  assert.match((await seo.pageMeta('/admin/productos')).noindex ? 'noindex' : '', /noindex/);
  const map = await seo.sitemap('https://vmbazar.com.ar');
  assert.match(map, /<loc>https:\/\/vmbazar.com.ar\/categoria\/cocina<\/loc>/);
  assert.match(map, new RegExp(`/producto/${p.slug}<`));
});
