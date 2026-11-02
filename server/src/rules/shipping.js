// Envío por código postal: distancia desde el local y tarifa tipo moto (base + por km + margen).
// Montos en centavos, como el resto del sistema.

// Valores de partida (editables en Panel → Envíos). Referencia: un viaje promedio de Uber Moto / DiDi Moto en el AMBA.
export const SHIPPING_DEFAULTS = {
  mode: 'postal', // 'postal' = calcula por código postal; 'zones' = el cliente elige una zona fija
  origin: { address: 'Merlo 2280, Moreno', postalCode: '1744', locality: 'Moreno', province: 'Buenos Aires', lat: -34.6506, lon: -58.7897 },
  baseFare: 120000, // tarifa por uso (bajada de bandera): $1.200
  perKm: 48000, // $480 por km recorrido
  marginPct: 30, // margen de seguridad sobre la tarifa de referencia
  minFare: 300000, // envío mínimo: $3.000
  maxKm: 40, // más lejos no se ofrece envío en moto
  roadFactor: 1.3, // la calle no es línea recta: km en línea recta × 1,3 ≈ km recorridos
  freeFrom: 0, // envío gratis desde este subtotal (0 = nunca)
};

// "B1744ABC", "1744", "b 1744" → "1744". null si no tiene 4 números.
export function normalizePostalCode(v) {
  const m = String(v ?? '').toUpperCase().replace(/\s/g, '').match(/^[A-Z]?(\d{4})([A-Z]{3})?$/);
  return m ? m[1] : null;
}

// Distancia en línea recta entre dos puntos (km).
export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const roundUp100 = (cents) => Math.ceil(cents / 10000) * 10000;

// Costo de envío para una distancia recorrida (km). Redondeado hacia arriba a $100.
export function shippingPrice(km, cfg = SHIPPING_DEFAULTS) {
  const ref = cfg.baseFare + cfg.perKm * km;
  const withMargin = ref * (1 + (cfg.marginPct ?? 0) / 100);
  return roundUp100(Math.max(withMargin, cfg.minFare ?? 0));
}

// Cálculo completo desde las coordenadas del cliente.
export function shippingQuote(dest, cfg = SHIPPING_DEFAULTS, { subtotal = 0 } = {}) {
  const straight = haversineKm(cfg.origin, dest);
  const km = Math.round(straight * (cfg.roadFactor ?? 1) * 10) / 10;
  if (cfg.maxKm && km > cfg.maxKm) return { km, available: false, price: null };
  const free = cfg.freeFrom > 0 && subtotal >= cfg.freeFrom;
  return { km, available: true, price: free ? 0 : shippingPrice(km, cfg), free };
}

const num = (v, def, { min = 0, max = Infinity } = {}) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

// Limpia lo que llega del panel. Los montos llegan en centavos.
export function cleanShippingSettings(data = {}, prev = SHIPPING_DEFAULTS) {
  const d = { ...SHIPPING_DEFAULTS, ...prev };
  const o = data.origin ?? {};
  const origin = {
    address: String(o.address ?? d.origin.address).trim().slice(0, 200),
    postalCode: normalizePostalCode(o.postalCode) ?? d.origin.postalCode,
    locality: String(o.locality ?? d.origin.locality).trim().slice(0, 120),
    province: String(o.province ?? d.origin.province).trim().slice(0, 80),
    lat: num(o.lat, d.origin.lat, { min: -56, max: -21 }),
    lon: num(o.lon, d.origin.lon, { min: -74, max: -53 }),
  };
  return {
    mode: data.mode === 'zones' ? 'zones' : data.mode === 'postal' ? 'postal' : d.mode,
    origin,
    baseFare: Math.round(num(data.baseFare, d.baseFare)),
    perKm: Math.round(num(data.perKm, d.perKm)),
    marginPct: num(data.marginPct, d.marginPct, { max: 300 }),
    minFare: Math.round(num(data.minFare, d.minFare)),
    maxKm: num(data.maxKm, d.maxKm, { max: 2000 }),
    roadFactor: num(data.roadFactor, d.roadFactor, { min: 1, max: 3 }),
    freeFrom: Math.round(num(data.freeFrom, d.freeFrom)),
  };
}
