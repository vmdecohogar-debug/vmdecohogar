// Envío por código postal: ubica al cliente y calcula el costo con la tarifa del panel.
//
// Cómo se ubica al cliente (de lo más preciso a lo menos):
//  1. Su dirección (calle y número) con Georef, el servicio gratuito del Estado (apis.datos.gob.ar).
//  2. El centro de su localidad, también con Georef.
//  3. La tabla de códigos postales incluida en el sistema (GeoNames, sin internet).
// Un código postal argentino de 4 números cubre una localidad entera (a veces varias), así que sin la
// dirección el cálculo puede errarle unos km. Por eso el margen de seguridad.
import { readFileSync } from 'node:fs';
import { direct } from '../db/index.js';
import { cleanShippingSettings, normalizePostalCode, SHIPPING_DEFAULTS, shippingQuote } from '../rules/shipping.js';
import { AppError, audit, getSettings } from './common.js';

const table = JSON.parse(readFileSync(new URL('../data/cp-ar.json', import.meta.url), 'utf8'));
const CABA = 'Ciudad Autónoma De Buenos Aires';

// Localidades de un código postal: [{ name, province, lat, lon }].
export function localitiesFor(postalCode) {
  const cp = normalizePostalCode(postalCode);
  if (!cp) return [];
  const n = Number(cp);
  if (n >= 1000 && n <= 1499) return [{ name: CABA, province: 'Ciudad Autónoma de Buenos Aires', lat: -34.6142, lon: -58.4458 }];
  return (table.cp[cp] ?? [])
    .map(([name, p, lat, lon]) => ({ name, province: table.provinces[p], lat, lon }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

const GEOREF = process.env.GEOREF_URL ?? 'https://apis.datos.gob.ar/georef/api';
const cache = new Map();

async function georef(path, params) {
  const url = `${GEOREF}/${path}?${new URLSearchParams({ ...params, max: '1' })}`;
  if (cache.has(url)) return cache.get(url);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const body = await res.json();
    if (cache.size > 2000) cache.clear();
    cache.set(url, body);
    return body;
  } catch {
    return null; // sin internet o Georef caído: se usa la tabla
  }
}

const point = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon } : null);

// Ubica una dirección. Devuelve { lat, lon, precision: 'direccion' | 'localidad' | 'codigo' } o null.
export async function locate({ address, locality, province, fallback }) {
  const street = String(address ?? '').trim();
  if (process.env.GEOREF_OFF !== '1') {
    if (street && /\d/.test(street) && locality) {
      // En el conurbano la "localidad" a veces es el partido: se prueba de las dos formas.
      for (const key of ['localidad', 'departamento']) {
        const r = await georef('direcciones', { direccion: street.replace(/,.*$/, ''), [key]: locality, ...(province ? { provincia: province } : {}) });
        const p = point(r?.direcciones?.[0]?.ubicacion);
        if (p) return { ...p, precision: 'direccion' };
      }
    }
    if (locality && locality !== CABA) {
      const r = await georef('localidades', { nombre: locality, ...(province ? { provincia: province } : {}), campos: 'centroide' });
      const p = point(r?.localidades?.[0]?.centroide);
      if (p) return { ...p, precision: 'localidad' };
    }
  }
  return fallback ? { lat: fallback.lat, lon: fallback.lon, precision: 'codigo' } : null;
}

export async function shippingSettings(db = direct) {
  const s = (await getSettings(db)).shipping;
  return cleanShippingSettings(s ?? {}, { ...SHIPPING_DEFAULTS, ...(s ?? {}), origin: { ...SHIPPING_DEFAULTS.origin, ...(s?.origin ?? {}) } });
}

// Costo de envío para el cliente. Lanza AppError con un mensaje claro si no se puede.
export async function quoteShipping({ postalCode, locality, address, subtotal = 0 }, cfg) {
  cfg = cfg ?? (await shippingSettings());
  const cp = normalizePostalCode(postalCode);
  if (!cp) throw new AppError('Escribí tu código postal (los 4 números, por ejemplo 1744).');
  const options = localitiesFor(cp);
  if (!options.length) throw new AppError(`No encontramos el código postal ${cp}. Revisalo o escribinos por WhatsApp.`);
  const chosen = options.find((o) => o.name === locality) ?? (options.length === 1 ? options[0] : null);
  if (!chosen) throw new AppError('Elegí tu localidad.');
  const where = await locate({ address, locality: chosen.name, province: chosen.province, fallback: chosen });
  const q = shippingQuote(where, cfg, { subtotal });
  if (!q.available) {
    throw new AppError(`Estás a unos ${Math.round(q.km)} km y por ahora el envío en moto llega hasta ${cfg.maxKm} km. Escribinos por WhatsApp y lo coordinamos.`);
  }
  return { postalCode: cp, locality: chosen.name, km: q.km, price: q.price, free: q.free, precision: where.precision };
}

// ---------- Administración ----------

export async function saveShippingSettings(data, adminId) {
  const s = cleanShippingSettings(data, await shippingSettings());
  await direct.query(`INSERT INTO settings (key, value) VALUES ('shipping', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [s]);
  await audit(direct, adminId, 'update', 'settings', null, { key: 'shipping' });
  return s;
}

// Botón "Ubicar en el mapa" del panel: busca las coordenadas del local.
export async function locateOrigin({ address, postalCode, locality }) {
  const options = localitiesFor(postalCode);
  const chosen = options.find((o) => o.name.toLowerCase() === String(locality ?? '').trim().toLowerCase()) ?? options[0];
  const where = await locate({ address, locality: locality || chosen?.name, province: chosen?.province ?? 'Buenos Aires', fallback: chosen });
  if (!where) throw new AppError('No pudimos ubicar esa dirección. Pegá la latitud y longitud desde Google Maps.');
  return where;
}
