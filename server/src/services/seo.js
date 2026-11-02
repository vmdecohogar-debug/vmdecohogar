// SEO: la tienda es una app de una sola página, así que el servidor completa en el HTML el título,
// la descripción, los datos para Google (JSON-LD) y la vista previa al compartir, según la página pedida.
import { config } from '../config.js';
import { direct } from '../db/index.js';
import { storeSettings } from './store.js';
import { getSettings } from './common.js';
import { faqJsonLd, infoPages } from '../content/info.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON dentro de <script>: se escapan "<" para que un texto no pueda cerrar la etiqueta.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const abs = (base, url) => (!url ? null : /^https?:\/\//.test(url) ? url : `${base}${url}`);
const money = (cents) => (cents / 100).toFixed(2);

// Descripción para Google y para la vista previa al compartir (hasta ~160 caracteres) de las páginas fijas.
const DEFAULT_DESCRIPTION = (name) => `Tienda online de bazar y decoración ${name}: cocina, baño, deco, organización, limpieza y más. Envíos y precios mayoristas.`;
const FIXED_PAGES = (name) => ({
  '/productos': { title: `Todos los productos | ${name}`, description: `Todos los productos de ${name}: bazar, cocina, baño, deco, organización, limpieza, belleza e infantiles. Comprá online con envío.` },
  '/contacto': { title: `Contacto | ${name}`, description: `Contactá a ${name} por WhatsApp, teléfono o mail. Consultas sobre productos, envíos, pagos y compras mayoristas.` },
  '/mayoristas': { title: `Compras mayoristas | ${name}`, description: `Comprá por mayor en ${name}: registrate como cliente mayorista y accedé a precios especiales en bazar y deco.` },
});

// Páginas informativas (preguntas frecuentes, tiempos de respuesta, privacidad) completadas con los datos del panel.
export async function storeInfo(store) {
  const s = await getSettings();
  return infoPages(store ?? (await storeSettings()).store, { wholesaleMin: Number(s.wholesale?.minOrder) || 0 });
}

export async function pageMeta(pathname, base = config.appUrl) {
  const { store } = await storeSettings();
  const name = store.name || 'VM Bazar y Deco';
  const meta = {
    title: store.seo?.title || name,
    description: store.seo?.description || store.tagline || '',
    url: `${base}${pathname === '/' ? '/' : pathname}`,
    image: `${base}/logo.jpg`,
    noindex: /^\/(admin|ingresar|carrito|finalizar|pedido)/.test(pathname),
    ld: [],
  };
  const social = Object.values(store.social ?? {}).filter(Boolean);
  if (pathname === '/') {
    meta.ld.push({
      '@context': 'https://schema.org', '@type': 'Store', name, url: `${base}/`, logo: `${base}/logo.jpg`, description: meta.description,
      ...(store.contact?.phone ? { telephone: store.contact.phone } : {}),
      ...(store.contact?.address ? { address: { '@type': 'PostalAddress', streetAddress: store.contact.address, addressLocality: store.contact.city || undefined, addressCountry: 'AR' } } : {}),
      ...(social.length ? { sameAs: social } : {}),
    });
    meta.ld.push({
      '@context': 'https://schema.org', '@type': 'WebSite', name, url: `${base}/`,
      potentialAction: { '@type': 'SearchAction', target: `${base}/productos?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    });
  }
  let m = /^\/producto\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) {
    const p = await direct.one(
      `SELECT p.name, p.description, p.image_url, p.extra_images, COALESCE(p.promo_list_price, p.list_price) AS list_price, p.sku, p.stock, p.out_of_stock, c.name AS category FROM products p
         LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = $1 AND p.active AND p.list_price > 0`,
      [m[1]],
    );
    if (p) {
      meta.title = `${p.name} | ${name}`;
      meta.description = (p.description || `${p.name} en ${name}.`).slice(0, 160);
      meta.image = abs(base, p.image_url) ?? meta.image;
      meta.type = 'product';
      meta.ld.push({
        '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, description: p.description || undefined,
        image: p.image_url ? [p.image_url, ...(p.extra_images ?? [])].map((u) => abs(base, u)) : undefined, category: p.category || undefined,
        brand: { '@type': 'Brand', name },
        offers: {
          '@type': 'Offer', price: money(p.list_price), priceCurrency: 'ARS', url: meta.url,
          availability: `https://schema.org/${p.out_of_stock ? 'OutOfStock' : 'InStock'}`, itemCondition: 'https://schema.org/NewCondition',
        },
      });
    } else meta.noindex = true;
  }
  m = /^\/categoria\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (m) {
    const c = await direct.one('SELECT name, image_url FROM categories WHERE slug = $1 AND active', [m[1]]);
    if (c) {
      meta.title = `${c.name} | ${name}`;
      meta.description = `${c.name}: productos de bazar y deco en ${name}. ${store.dispatchNote ?? ''}`.trim().slice(0, 160);
      meta.image = abs(base, c.image_url) ?? meta.image;
    } else meta.noindex = true;
  }
  const fixed = FIXED_PAGES(name)[pathname.replace(/\/$/, '') || '/'];
  if (fixed) Object.assign(meta, fixed);
  const info = Object.values(await storeInfo(store)).find((pg) => pg.path === pathname.replace(/\/$/, ''));
  if (info) {
    meta.title = `${info.title} | ${name}`;
    meta.description = info.description;
    if (info.groups) meta.ld.push(faqJsonLd(info));
  }
  if (!meta.description) meta.description = DEFAULT_DESCRIPTION(name);
  return meta;
}

// Reemplaza el bloque <!--seo-->…<!--/seo--> del index.html compilado.
export function injectMeta(html, meta) {
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${esc(meta.url)}" />`,
    meta.noindex ? '<meta name="robots" content="noindex" />' : '<meta name="robots" content="index, follow" />',
    `<meta property="og:type" content="${meta.type ?? 'website'}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(meta.url)}" />`,
    `<meta property="og:image" content="${esc(meta.image)}" />`,
    '<meta property="og:locale" content="es_AR" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    ...meta.ld.map(jsonLd),
  ].join('\n    ');
  return html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, tags);
}

export async function sitemap(base = config.appUrl) {
  const products = (await direct.query(`SELECT slug, updated_at FROM products WHERE active AND list_price > 0 AND slug IS NOT NULL ORDER BY id`)).rows;
  const cats = (await direct.query('SELECT slug FROM categories WHERE active ORDER BY position')).rows;
  const url = (loc, lastmod, priority) => `  <url><loc>${esc(base + loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url('/', null, '1.0'),
    url('/productos', null, '0.8'),
    url('/contacto', null, '0.5'),
    url('/preguntas-frecuentes', null, '0.5'),
    url('/tiempos-de-respuesta', null, '0.4'),
    url('/privacidad', null, '0.3'),
    ...cats.map((c) => url(`/categoria/${c.slug}`, null, '0.8')),
    ...products.map((p) => url(`/producto/${p.slug}`, p.updated_at, '0.7')),
    '</urlset>',
  ].join('\n');
}

// robots.txt: qué puede recorrer Google. Las páginas privadas (panel, carrito, pedidos) quedan afuera.
// /api/store/ queda permitido porque Google arma las páginas de la tienda pidiendo esos datos:
// si se bloquea, ve los productos vacíos.
export function robots(base = config.appUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /api/store/',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /ingresar',
    'Disallow: /carrito',
    'Disallow: /finalizar',
    'Disallow: /pedido/',
    'Disallow: /api/store/orders',
    'Disallow: /*?*orden=',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}
