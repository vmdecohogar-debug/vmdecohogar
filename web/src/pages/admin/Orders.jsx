import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, fecha, pesos } from '../../format.js';
import { Badge, Loading, Notice, Qty, useAction, useApi } from '../../components/ui.jsx';

// Segunda visita del kit: cuánto devuelve de cada producto.
function CloseKit({ order, onDone }) {
  const [returns, setReturns] = useState({});
  const { busy, msg, run } = useAction();
  const kept = order.items.reduce((s, i) => s + (i.qty - (returns[i.id] ?? 0)) * i.unit_price, 0);
  return (
    <div className="card tint stack">
      <h3>Cerrar kit #{order.id}</h3>
      {order.change_request?.note && <p>Pidió: “{order.change_request.note}”</p>}
      <Notice msg={msg} />
      <ul className="list">
        {order.items.map((i) => (
          <li key={i.id} className="row between">
            <span>{i.qty} × {i.product}</span>
            <span className="row"><span className="muted small">devuelve</span><Qty value={returns[i.id] ?? 0} max={i.qty} onChange={(q) => setReturns({ ...returns, [i.id]: q })} /></span>
          </li>
        ))}
      </ul>
      <p>Se queda con <strong>{pesos(kept)}</strong>: queda como deuda contra entrega con vencimiento hoy. Para sumar productos nuevos, cargá un pedido aparte cuando pase a Bronce.</p>
      <button className="btn" disabled={busy} onClick={() => run(() => api(`/admin/kits/${order.id}/close`, {
        method: 'POST', body: { returns: Object.entries(returns).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty })) },
      }).then(onDone))}>Cerrar kit</button>
    </div>
  );
}

const TABS = [['confirmed', 'Para entregar'], ['delivered', 'Kits abiertos'], ['settled', 'Cerrados'], ['cancelled', 'Cancelados']];

export default function AdminOrders() {
  const [tab, setTab] = useState('confirmed');
  const { data, error, reload } = useApi(`/admin/orders?status=${tab}`);
  const [closing, setClosing] = useState(null);
  const { busy, msg, run } = useAction();

  return (
    <div>
      <h1>Pedidos</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map(([k, l]) => <button key={k} className={`btn small ${tab === k ? '' : 'secondary'}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <Notice msg={msg} />
      {closing && <CloseKit order={closing} onDone={() => { setClosing(null); reload(); }} />}
      {!data ? <Loading error={error} /> : data.length === 0 ? <p className="muted">No hay pedidos.</p> : (
        <div className="stack">
          {data.map((o) => (
            <div key={o.id} className="card">
              <div className="row between">
                <div>
                  <strong>#{o.id} · {o.seller_name}</strong> {o.kind === 'kit' && <Badge tone="amarillo">Kit</Badge>}
                  <div className="muted small">
                    {LABELS.payment_mode[o.payment_mode]} · entrega {fecha(o.delivery_date)} {o.deliver_to === 'leader' ? 'en casa de la jefa zonal' : o.address ? `en ${o.address}` : ''}
                  </div>
                </div>
                <strong>{pesos(o.total)}</strong>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>{(o.items ?? []).map((i) => `${i.qty} × ${i.product}`).join(' · ')}</div>
              <div className="row" style={{ marginTop: 10 }}>
                {o.status === 'confirmed' && <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/orders/${o.id}/deliver`, { method: 'POST' }).then(reload), `Pedido #${o.id} entregado.`)}>Marcar entregado</button>}
                {o.status === 'confirmed' && <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/orders/${o.id}/cancel`, { method: 'POST' }).then(reload))}>Cancelar</button>}
                {o.kind === 'kit' && o.status === 'delivered' && <button className="btn small" onClick={() => setClosing(o)}>Segunda visita</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
