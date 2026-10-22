import { Link } from 'react-router-dom';
import { LABELS, fecha, pesos } from '../../format.js';
import { Badge, Loading, Semaphore, useApi } from '../../components/ui.jsx';

export default function SellerPayments() {
  const { data, error } = useApi('/seller/dashboard');
  if (!data) return <Loading error={error} />;
  const total = data.pending.reduce((s, p) => s + p.balance, 0);

  return (
    <div>
      <h1>Mis pagos</h1>
      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Pagos pendientes</h3>
          <strong>{pesos(total)}</strong>
        </div>
        {data.pending.length === 0 ? <p className="muted">Estás al día.</p> : (
          <ul className="list">
            {data.pending.map((p) => (
              <li key={p.id} className="row between">
                <div>
                  <strong>{pesos(p.balance)}</strong> <Semaphore value={p.semaphore} />
                  <div className="muted small">
                    Pedido #{p.order_id} · {LABELS.ob_kind[p.kind]} · {p.due_date ? `vence ${fecha(p.due_date)}` : 'vence al entregar'}
                    {p.days_late > 0 && ` · ${p.days_late} días de atraso`}
                    {p.surcharge > 0 && ` · incluye recargo ${pesos(p.surcharge)}`}
                  </div>
                </div>
                <Link className="btn small" to={`/pagar/${p.id}`} style={{ textDecoration: 'none' }}>Pagar</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h3>Pagos realizados</h3>
        {data.payments.length === 0 ? <p className="muted">Todavía no hay pagos.</p> : (
          <ul className="list">
            {data.payments.map((p) => (
              <li key={p.id} className="row between">
                <div>
                  <strong>{pesos(p.amount)}</strong>
                  <div className="muted small">{LABELS.method[p.method]} · {fecha(p.credited_at ?? p.created_at)}</div>
                </div>
                <Badge tone={p.status === 'credited' ? 'verde' : p.status === 'rejected' ? 'rojo' : 'amarillo'}>{LABELS.pay_status[p.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
