export const pesos = (cents) =>
  `$${(Number(cents ?? 0) / 100).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Convierte lo que tipea la usuaria ("12.500,50") a centavos.
export const toCents = (text) => Math.round(Number(String(text).replace(/\./g, '').replace(',', '.')) * 100);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fecha = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};
export const fechaCorta = (d) => {
  if (!d) return '—';
  const [, m, day] = String(d).slice(0, 10).split('-').map(Number);
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(`${String(d).slice(0, 10)}T12:00:00Z`).getUTCDay()];
  return `${wd} ${day} ${MONTHS[m - 1]}`;
};

export const LABELS = {
  payment_mode: { prepaid: 'Pago antes de recibir', on_delivery: 'Contra entrega', credit: 'A crédito', consignment: 'Consignación (kit)' },
  order_status: { confirmed: 'Confirmado', delivered: 'Entregado', settled: 'Cerrado', cancelled: 'Cancelado' },
  ob_kind: { upfront: 'Pago anticipado', on_delivery: 'Contra entrega', credit: 'Crédito' },
  method: { mercadopago: 'Mercado Pago', cash: 'Efectivo', transfer: 'Transferencia' },
  pay_status: { reported: 'Informado', credited: 'Acreditado', rejected: 'Rechazado' },
  semaphore: { verde: 'Al día', amarillo: 'Vence pronto', rojo: 'En mora' },
  user_status: { pending: 'Pendiente', active: 'Activa', blocked: 'Bloqueada', inactive: 'Baja' },
};
