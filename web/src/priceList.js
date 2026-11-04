// Lista de precios para descargar desde el panel: agrupa los productos visibles por categoría
// y arma el archivo para Excel. Sin React, para poder probarlo solo.

// Precio que paga hoy el cliente: el de promo si hay descuento, si no el normal.
const current = (normal, promo) => (promo > 0 ? promo : normal);

// Devuelve [{ name, items: [...] }] en el orden de las categorías del panel, "Sin categoría" al final.
// Solo productos activos con precio. Dentro de cada categoría, orden alfabético.
export function groupPriceList(products, categories) {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const groups = new Map();
  for (const p of products) {
    if (!p.active || !(p.list_price > 0)) continue;
    const key = order.has(p.category_id) ? p.category_id : 'none';
    if (!groups.has(key)) groups.set(key, { name: key === 'none' ? 'Sin categoría' : p.category_name, items: [] });
    groups.get(key).items.push({
      sku: p.sku,
      name: p.name,
      image_url: p.image_url,
      wholesale: current(p.wholesale_price || p.list_price, p.promo_wholesale_price),
      list: current(p.list_price, p.promo_list_price),
      discount: p.promo_list_price ? Math.round(p.discount_pct) : null,
      out_of_stock: !!p.out_of_stock,
    });
  }
  const rank = (k) => (k === 'none' ? Infinity : order.get(k));
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([, g]) => ({ ...g, items: g.items.sort((a, b) => a.name.localeCompare(b.name, 'es')) }));
}

// Archivo .csv que Excel abre directo en español: separado por ";", con BOM para los acentos,
// y precios como números enteros en pesos para poder hacer cuentas.
export function priceListCsv(groups, { includeList = true } = {}) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Categoría', 'Código', 'Producto', 'Precio mayorista', ...(includeList ? ['Precio de lista'] : []), 'Descuento', 'Sin stock'];
  const lines = [head];
  for (const g of groups) {
    for (const it of g.items) {
      lines.push([g.name, it.sku, it.name, Math.round(it.wholesale / 100), ...(includeList ? [Math.round(it.list / 100)] : []),
        it.discount ? `${it.discount}%` : '', it.out_of_stock ? 'Sí' : '']);
    }
  }
  return `﻿${lines.map((l) => l.map(cell).join(';')).join('\r\n')}\r\n`;
}
