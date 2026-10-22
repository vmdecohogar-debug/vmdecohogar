import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, fecha, pesos } from '../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../components/ui.jsx';

function KitChanges({ kit, onDone }) {
  const [text, setText] = useState(kit.change_request?.note ?? '');
  const { busy, msg, run } = useAction();
  return (
    <div className="card tint stack">
      <h3>Cambios para la segunda visita</h3>
      <p className="muted small">Contanos qué querés devolver, cambiar o agregar. Lo vemos en la visita y pagás solo lo que te quedás.</p>
      <Notice msg={msg} />
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: devuelvo 1 mantel, sumo 2 velas" />
      <button className="btn" disabled={busy} onClick={() => run(() => api(`/seller/kit/${kit.id}/changes`, { method: 'POST', body: { note: text } }).then(onDone), 'Guardado.')}>Guardar cambios</button>
    </div>
  );
}

export default function SellerOrders() {
  const { data, error, reload } = useApi('/seller/dashboard');
  const { msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const openKit = data.orders.find((o) => o.kind === 'kit' && o.status === 'delivered');

  return (
    <div>
      <h1>Mis pedidos</h1>
      <Notice msg={msg} />
      {openKit && <KitChanges kit={openKit} onDone={reload} />}
      {data.orders.length === 0 ? <p className="muted">Todavía no hiciste pedidos.</p> : (
        <div className="card table-wrap">
          <table className="responsive">
            <thead><tr><th>Pedido</th><th>Forma de pago</th><th>Entrega</th><th>Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td data-label="Pedido">#{o.id}{o.kind === 'kit' ? ' · kit' : ''}</td>
                  <td data-label="Forma de pago">{LABELS.payment_mode[o.payment_mode]}</td>
                  <td data-label="Entrega">{fecha(o.delivered_at ?? o.delivery_date)}{o.deliver_to === 'leader' ? ' (jefa zonal)' : ''}</td>
                  <td data-label="Total">{pesos(o.total)}{o.discount > 0 && <div className="muted small">ahorraste {pesos(o.discount)}</div>}</td>
                  <td data-label="Estado"><Badge tone={o.status === 'cancelled' ? 'rojo' : o.status === 'confirmed' ? 'amarillo' : 'verde'}>{LABELS.order_status[o.status]}</Badge></td>
                  <td>{o.status === 'confirmed' && <button className="btn secondary small" onClick={() => run(() => api(`/seller/orders/${o.id}/cancel`, { method: 'POST' }).then(reload), 'Pedido cancelado.')}>Cancelar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
