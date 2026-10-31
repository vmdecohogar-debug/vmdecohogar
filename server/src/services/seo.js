// SEO: la tienda es una app de una sola página, así que el servidor completa en el HTML el título,
// la descripción, los datos para Google (JSON-LD) y la vista previa al compartir, según la página pedida.
import { config } from '../config.js';
import { direct } from '../db/index.js';
import { storeSettings } from './store.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON dentro de <script>: se escapan "<" para que un texto no pueda cerrar la etiqueta.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const abs = (base, url) => (!url ? null : /^https?:\/\//.test(url) ? url : `${base}${url}`);
const money = (cents) => (cents / 100).toFixed(2);

export async function pageMeta(pathname, base = config.appUrl) {
  const { store } = await storeSettings();
  const name = store.name || 'VM Bazar y Deco';
  const meta = {
    title: store.seo?.title || name,
    description: store.seo?.description || store.tagline || '',
    url: `${base}${pathname === '/' ? '/' : pathname}`,
    image: `${base}/logo.jpg`,
    noindex: /^\/(admin|ingresar|carrito)/.test(pathname),
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
      `SELECT p.name, p.description, p.image_url, p.list_price, p.sku, p.stock, c.name AS category FROM products p
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
        image: p.image_url ? [abs(base, p.image_url)] : undefined, category: p.category || undefined,
        brand: { '@type': 'Brand', name },
        offers: {
          '@type': 'Offer', price: money(p.list_price), priceCurrency: 'ARS', url: meta.url,
          availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
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
  if (pathname === '/productos') meta.title = `Todos los productos | ${name}`;
  if (pathname === '/contacto') meta.title = `Contacto | ${name}`;
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
    ...cats.map((c) => url(`/categoria/${c.slug}`, null, '0.8')),
    ...products.map((p) => url(`/producto/${p.slug}`, p.updated_at, '0.7')),
    '</urlset>',
  ].join('\n');
}

export function robots(base = config.appUrl) {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /ingresar\nDisallow: /carrito\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}
