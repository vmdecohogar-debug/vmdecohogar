// Mismo cálculo que el servidor (server/src/rules/store.js) para mostrar el precio mientras se carga el producto.
export function priceFromCost(cost, marginPct, rounding = 100) {
  if (!(cost > 0)) return null;
  const raw = cost * (1 + Number(marginPct) / 100);
  const step = Math.max(1, Math.round(Number(rounding) || 0)) * 100;
  return Math.ceil(Math.round(raw) / step) * step;
}

// Ganancia sobre el costo, en %.
export const marginOf = (price, cost) => (price > 0 && cost > 0 ? Math.round((price / cost - 1) * 100) : null);
