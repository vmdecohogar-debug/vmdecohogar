// Reglas puras de la tienda online (sin base de datos), para poder probarlas solas.

// Precio a partir del costo y un margen en %: costo × (1 + margen/100), redondeado hacia arriba
// al múltiplo de `rounding` pesos (100 = a los $100). Montos en centavos.
export function priceFromCost(cost, marginPct, rounding = 100) {
  if (!(cost > 0)) return null;
  const raw = cost * (1 + Number(marginPct) / 100);
  const step = Math.max(1, Math.round(Number(rounding) || 0)) * 100;
  return Math.ceil(Math.round(raw) / step) * step;
}

// Precios de lista y mayorista de un producto según su modo:
// - margin: se calculan desde el costo con los márgenes del producto o, si no tiene, los de la tienda.
// - manual: se usan los precios cargados tal cual.
export function computePrices(p, { margins = { list: 65, wholesale: 50 }, rounding = 100 } = {}) {
  const errors = [];
  let list = p.list_price ?? null;
  let wholesale = p.wholesale_price ?? null;
  if (p.price_mode === 'manual') {
    if (!(list > 0)) errors.push('Falta el precio de lista.');
    if (!(wholesale > 0)) wholesale = list;
  } else {
    if (!(p.cost > 0)) errors.push('Falta el costo.');
    list = priceFromCost(p.cost, p.list_margin ?? margins.list, rounding);
    wholesale = priceFromCost(p.cost, p.wholesale_margin ?? margins.wholesale, rounding);
  }
  if (list > 0 && wholesale > list) errors.push('El precio mayorista no puede ser mayor al de lista.');
  return { list_price: list, wholesale_price: wholesale, errors };
}

// "Organización y Baño" → "organizacion-y-bano"
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEX = /^#[0-9a-f]{6}$/i;
export const THEME_COLORS = ['primary', 'onPrimary', 'primarySoft', 'accent', 'accentSoft', 'bg', 'surface', 'text', 'textSoft', 'line', 'footerBg', 'footerText'];
export const FONT_SLOTS = ['brand', 'title', 'body', 'banner', 'bannerSub'];

// Familia tipográfica tomada de un enlace de Google Fonts: ...?family=Playfair+Display:wght@500 → "Playfair Display"
export function fontFamilyFromUrl(url) {
  const m = /[?&]family=([^:&]+)/.exec(String(url ?? ''));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

// Valida la apariencia que guarda administración. Devuelve la versión limpia o los errores.
export function cleanTheme(theme) {
  const errors = [];
  const out = { light: {}, dark: {}, fonts: {} };
  for (const mode of ['light', 'dark']) {
    for (const k of THEME_COLORS) {
      const v = theme?.[mode]?.[k];
      if (!HEX.test(v ?? '')) errors.push(`Color inválido: ${mode === 'light' ? 'claro' : 'oscuro'} / ${k}.`);
      else out[mode][k] = v.toLowerCase();
    }
  }
  for (const slot of FONT_SLOTS) {
    const f = theme?.fonts?.[slot] ?? {};
    const url = String(f.url ?? '').trim();
    if (url && !/^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(url)) errors.push(`El enlace de la tipografía "${slot}" tiene que ser de Google Fonts.`);
    const family = String(f.family ?? '').trim() || fontFamilyFromUrl(url);
    if (!family) errors.push(`Falta la tipografía "${slot}".`);
    else if (/[;{}<>"]/.test(family)) errors.push(`Nombre de tipografía inválido: ${family}.`);
    out.fonts[slot] = { family, url };
  }
  return { theme: out, errors };
}

// Enlace "seguro" para banners y redes: solo http(s), rutas internas o WhatsApp.
export function safeLink(link) {
  const l = String(link ?? '').trim();
  if (!l) return null;
  if (l.startsWith('/') && !l.startsWith('//')) return l;
  if (/^https?:\/\//i.test(l)) return l;
  return null;
}
