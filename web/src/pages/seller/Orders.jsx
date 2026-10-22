import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, fecha, pesos } from '../../format.js';
import { Badge, Loading, Notice, Qty, useAction, useApi } from '../../components/ui.jsx';
import Claims from './Claims.jsx';

// Segunda visita: qué devuelve del kit y qué productos nuevos quiere, elegidos del catálogo.
function KitChanges({ kit, onDone }) {
  const products = useApi('/products');
  const prev = kit.change_request ?? {};
  const [returns, setReturns] = useState(() => Object.fromEntries((prev.returns ?? []).map((r) => [r.itemId, r.qty])));
  const [additions, setAdditions] = useState(() => Object.fromEntries((prev.additions ?? []).map((a) => [a.productId, a.qty])));
  const [note, setNote] = useState(prev.note ?? '');
  const [q, setQ] = useState('');
  const { busy, msg, run } = useAction();

  const list = products.data ?? [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const kitTotal = kit.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const returned = kit.items.reduce((s, i) => s + (returns[i.id] ?? 0) * i.unit_price, 0);
  const added = Object.entries(additions).reduce((s, [id, n]) => s + n * (byId.get(Number(id))?.price ?? 0), 0);
  const found = q.trim() ? list.filter((p) => p.stock > 0 && `${p.name} ${p.category ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  const save = () => run(() => api(`/seller/kit/${kit.id}/changes`, {
    method: 'POST',
    body: {
      returns: Object.entries(returns).filter(([, n]) => n > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty })),
      additions: Object.entries(additions).filter(([, n]) => n > 0).map(([productId, qty]) => ({ productId: Number(productId), qty })),
      note,
    },
  }).then(onDone), 'Listo, le llegó a administración. Lo traen en la segunda visita.');

  return (
    <div className="card tint stack">
      <h3>Cambios para la segunda visita</h3>
      <p className="muted small">Marcá lo que devolvés y sumá lo que quieras del catálogo. En la visita te llevan lo nuevo, retiran lo que devolvés y pagás solo lo que te quedás.</p>
      {kit.change_request && <Badge tone="verde">Pedido de cambios enviado el {fecha(kit.change_request.requested_at)}</Badge>}
      <Notice msg={msg} />

      <h4>Devuelvo</h4>
      <ul className="list">
        {kit.items.map((i) => (
          <li key={i.id} className="row between">
            <span>{i.qty} × {i.product}<div className="muted small">{pesos(i.unit_price)} c/u</div></span>
            <Qty value={returns[i.id] ?? 0} max={i.qty} onChange={(n) => setReturns({ ...returns, [i.id]: n })} />
          </li>
        ))}
      </ul>

      <h4>Sumo</h4>
      {Object.entries(additions).filter(([, n]) => n > 0).length > 0 && (
        <ul className="list">
          {Object.entries(additions).filter(([, n]) => n > 0).map(([id, n]) => {
            const p = byId.get(Number(id));
            return (
              <li key={id} className="row between">
                <span>{p?.name ?? 'Producto'}<div className="muted small">{p ? pesos(p.price) : ''} c/u</div></span>
                <Qty value={n} max={p?.stock} onChange={(v) => setAdditions({ ...additions, [id]: v })} />
              </li>
            );
          })}
        </ul>
      )}
      <input placeholder="Buscar en el catálogo para sumar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto para sumar" />
      {found.length > 0 && (
        <ul className="list">
          {found.map((p) => (
            <li key={p.id} className="row between">
              <span>{p.name}<div className="muted small">{pesos(p.price)}{p.category ? ` · ${p.category}` : ''}</div></span>
              <button type="button" className="btn secondary small" onClick={() => { setAdditions({ ...additions, [p.id]: (additions[p.id] ?? 0) + 1 }); setQ(''); }}>Sumar</button>
            </li>
          ))}
        </ul>
      )}

      <div><label htmlFor="kit-note">Comentario (opcional)</label><textarea id="kit-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: el mantel en otro color si hay" /></div>
      <p className="small">Te quedarías con <strong>{pesos(kitTotal - returned + added)}</strong>{added > 0 && <span className="muted"> (incluye {pesos(added)} de productos nuevos)</span>}.</p>
      <button className="btn" disabled={busy} onClick={save}>{kit.change_request ? 'Actualizar cambios' : 'Enviar cambios'}</button>
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
      <Claims />
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
