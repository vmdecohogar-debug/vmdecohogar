// Lectura de un catálogo pegado como texto (por ejemplo, copiado de WhatsApp) o como CSV.
// Devuelve filas { name, price, suggested_price, stock, category, description, sku } con montos en centavos.

const MONEY_RE = /\$?\s?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$?\s?\d+(?:,\d{1,2})?/g;

// "$4.500" → 450000, "4.500,50" → 450050, "4500" → 450000
export function parseMoney(text) {
  if (text == null) return null;
  const clean = String(text).replace(/[$\s]/g, '');
  if (!clean) return null;
  const normalized = clean.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const HEADERS = {
  name: ['nombre', 'producto', 'name', 'articulo', 'artículo'],
  price: ['precio', 'precio vendedora', 'precio a vendedora', 'costo', 'price'],
  suggested_price: ['sugerido', 'precio sugerido', 'precio publico', 'precio público', 'pvp'],
  stock: ['stock', 'cantidad'],
  category: ['categoria', 'categoría', 'rubro'],
  description: ['descripcion', 'descripción', 'detalle'],
  sku: ['codigo', 'código', 'sku'],
};

function headerKey(cell) {
  const c = cell.trim().toLowerCase();
  return Object.keys(HEADERS).find((k) => HEADERS[k].includes(c)) ?? null;
}

function detectDelimiter(line) {
  for (const d of ['\t', ';', ',']) if (line.split(d).length > 1) return d;
  return null;
}

function rowFromCells(keys, cells) {
  const row = {};
  keys.forEach((k, i) => {
    if (!k) return;
    const v = (cells[i] ?? '').trim();
    if (k === 'price' || k === 'suggested_price') row[k] = parseMoney(v);
    else if (k === 'stock') row[k] = v === '' ? null : Number.parseInt(v, 10);
    else row[k] = v || null;
  });
  return row;
}

// Línea libre: "Vela de soja 200 g - $4.500 / $6.500" → nombre y hasta dos precios.
function rowFromFreeText(line) {
  const text = line.replace(/^[\s•*\-–·\d.)]+(?=\D)/, '').trim();
  // Números seguidos de una unidad ("200 g", "45 x 45") son medidas, no precios.
  let candidates = [...text.matchAll(MONEY_RE)].filter((m) => {
    const after = text.slice(m.index + m[0].length);
    return !/^\s?(g|gr|grs|kg|ml|cc|l|lts|cm|mm|m|u|un|unid|x)\b/i.test(after) && !/x\s?$/i.test(text.slice(0, m.index));
  });
  // Si algún número tiene "$", solo esos son precios.
  if (candidates.some((m) => m[0].includes('$'))) candidates = candidates.filter((m) => m[0].includes('$'));
  const amounts = candidates
    .filter((m) => m[0].includes('$') || m[0].replace(/\D/g, '').length >= 3)
    .map((m) => ({ index: m.index, value: parseMoney(m[0]) }));
  if (amounts.length === 0) return { name: text || null, price: null };
  const name = text.slice(0, amounts[0].index).replace(/[\s:\-–|/=]+$/, '').replace(/\s*(precio|costo)$/i, '').trim();
  return { name: name || null, price: amounts[0].value, suggested_price: amounts[1]?.value ?? null };
}

export function parseCatalog(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = delimiter ? lines[0].split(delimiter) : [];
  const keys = headerCells.map(headerKey);
  const hasHeader = keys.filter(Boolean).length >= 2 && keys.includes('name');
  const rows = [];
  if (hasHeader) {
    for (const line of lines.slice(1)) rows.push(rowFromCells(keys, line.split(delimiter)));
  } else {
    for (const line of lines) {
      const d = detectDelimiter(line);
      // Sin encabezado, se asume el orden: nombre; precio; sugerido; stock; categoría
      if (d && d !== ',') rows.push(rowFromCells(['name', 'price', 'suggested_price', 'stock', 'category', 'description'], line.split(d)));
      else rows.push(rowFromFreeText(line));
    }
  }
  return rows.map(validateRow);
}

export function validateRow(row) {
  const errors = [];
  if (!row.name) errors.push('Falta el nombre.');
  if (!row.price || row.price <= 0) errors.push('Falta el precio a vendedora.');
  if (row.suggested_price != null && row.price && row.suggested_price < row.price) errors.push('El precio sugerido es menor al de vendedora.');
  if (row.stock != null && (!Number.isInteger(row.stock) || row.stock < 0)) errors.push('Stock inválido.');
  return { ...row, errors };
}

// Código automático a partir de la categoría o el nombre: "Velas" → VEL-007
export function skuPrefix(row) {
  const base = (row.category || row.name || 'PRD').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (base + 'XXX').slice(0, 3);
}
