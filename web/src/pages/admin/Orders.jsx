import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, fecha, pesos } from '../../format.js';
import { Badge, Loading, Notice, Qty, useAction, useApi } from '../../components/ui.jsx';

const LEVELS = { inicial: 'Inicial', bronce: 'Bronce', plata: 'Plata', oro: 'Oro' };
const wa = (phone) => `https://wa.me/${String(phone ?? '').replace(/\D/g, '')}`;
const refreshCounts = () => window.dispatchEvent(new Event('admin-counts'));

// Ficha de la vendedora y de su jefa zonal, para saber a quién se entrega y a quién avisar.
function Profiles({ o }) {
  return (
    <div className="profiles">
      <div className="profile">
        <div className="muted small">Vendedora</div>
        <strong>{o.seller_name}</strong> <Badge>{LEVELS[o.level_code] ?? o.level_code}</Badge>
        <div className="small"><a href={wa(o.seller_phone)} target="_blank" rel="noreferrer">{o.seller_phone}</a></div>
        {o.seller_address && <div className="small">{o.seller_address}</div>}
        <div className="muted small">Código {o.referral_code}{o.referred_by_name ? ` · la refirió ${o.referred_by_name}` : ''}</div>
        <div className="small">
          {o.seller_debt > 0
            ? <Badge tone={o.seller_max_late > 0 ? 'rojo' : 'amarillo'}>Debe {pesos(o.seller_debt)}{o.seller_max_late > 0 ? ` · ${o.seller_max_late} días de atraso` : ''}</Badge>
            : <Badge tone="verde">Sin deuda</Badge>}
        </div>
      </div>
      <div className="profile">
        <div className="muted small">Jefa zonal</div>
        {o.seller_is_leader ? <span className="small">Ella es jefa zonal.</span> : o.leader ? (
          <>
            <strong>{o.leader.name}</strong>
            <div className="small"><a href={wa(o.leader.phone)} target="_blank" rel="noreferrer">{o.leader.phone}</a></div>
            {o.leader.address && <div className="small">{o.leader.address}</div>}
          </>
        ) : <span className="muted small">Sin jefa zonal todavía.</span>}
      </div>
    </div>
  );
}

// Lo que pidió la vendedora para la segunda visita del kit.
function ChangeSummary({ o }) {
  const cr = o.change_request;
  if (!cr) return null;
  const items = new Map((o.items ?? []).map((i) => [i.id, i]));
  return (
    <div className="card tint small" style={{ marginTop: 10 }}>
      <strong>Pidió cambios{cr.requested_at ? ` el ${fecha(cr.requested_at)}` : ''}</strong>
      {cr.returns?.length > 0 && <div>Devuelve: {cr.returns.map((r) => `${r.qty} × ${items.get(r.itemId)?.product ?? 'producto'}`).join(' · ')}</div>}
      {cr.additions?.length > 0 && <div>Suma: {cr.additions.map((a) => `${a.qty} × ${a.product ?? 'producto'}`).join(' · ')}</div>}
      {cr.note && <div>“{cr.note}”</div>}
    </div>
  );
}

// Segunda visita del kit: viene cargada con lo que pidió la vendedora; se puede ajustar en el momento.
function CloseKit({ order, onDone, onCancel }) {
  const products = useApi('/admin/products');
  const cr = order.change_request ?? {};
  const [returns, setReturns] = useState(() => Object.fromEntries((cr.returns ?? []).map((r) => [r.itemId, r.qty])));
  const [additions, setAdditions] = useState(() => Object.fromEntries((cr.additions ?? []).map((a) => [a.productId, a.qty])));
  const [q, setQ] = useState('');
  const { busy, msg, run } = useAction();

  const list = (products.data?.products ?? []).filter((p) => p.active);
  const byId = new Map(list.map((p) => [p.id, p]));
  const priceOf = (id) => byId.get(Number(id))?.price ?? cr.additions?.find((a) => a.productId === Number(id))?.unit_price ?? 0;
  const kept = order.items.reduce((s, i) => s + (i.qty - (returns[i.id] ?? 0)) * i.unit_price, 0)
    + Object.entries(additions).reduce((s, [id, n]) => s + n * priceOf(id), 0);
  const found = q.trim() ? list.filter((p) => p.stock > 0 && `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const added = Object.entries(additions).filter(([, n]) => n > 0);

  return (
    <div className="card tint stack">
      <h3>Segunda visita · kit #{order.id} de {order.seller_name}</h3>
      {order.change_request && <p className="muted small">Ya está cargado lo que pidió. Ajustalo si en la visita cambió algo.</p>}
      {cr.note && <p>Comentario: “{cr.note}”</p>}
      <Notice msg={msg} />
      <h4>Retirás</h4>
      <ul className="list">
        {order.items.map((i) => (
          <li key={i.id} className="row between">
            <span>{i.qty} × {i.product}</span>
            <span className="row"><span className="muted small">devuelve</span><Qty value={returns[i.id] ?? 0} max={i.qty} onChange={(n) => setReturns({ ...returns, [i.id]: n })} /></span>
          </li>
        ))}
      </ul>
      <h4>Llevás</h4>
      {added.length === 0 && <p className="muted small">Nada nuevo.</p>}
      {added.length > 0 && (
        <ul className="list">
          {added.map(([id, n]) => (
            <li key={id} className="row between">
              <span>{byId.get(Number(id))?.name ?? cr.additions?.find((a) => a.productId === Number(id))?.product}<div className="muted small">{pesos(priceOf(id))} c/u</div></span>
              <Qty value={n} max={byId.get(Number(id))?.stock} onChange={(v) => setAdditions({ ...additions, [id]: v })} />
            </li>
          ))}
        </ul>
      )}
      <input placeholder="Sumar otro producto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto para sumar" />
      {found.length > 0 && (
        <ul className="list">
          {found.map((p) => (
            <li key={p.id} className="row between">
              <span>{p.name}<div className="muted small">{pesos(p.price)} · stock {p.stock}</div></span>
              <button type="button" className="btn secondary small" onClick={() => { setAdditions({ ...additions, [p.id]: (additions[p.id] ?? 0) + 1 }); setQ(''); }}>Sumar</button>
            </li>
          ))}
        </ul>
      )}
      <p>Se queda con <strong>{pesos(kept)}</strong>: lo paga contra entrega, con vencimiento hoy.</p>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => run(() => api(`/admin/kits/${order.id}/close`, {
          method: 'POST',
          body: {
            returns: Object.entries(returns).filter(([, n]) => n > 0).map(([itemId, qty]) => ({ itemId: Number(itemId), qty })),
            additions: added.map(([productId, qty]) => ({ productId: Number(productId), qty })),
          },
        }).then(onDone))}>Cerrar kit</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Volver</button>
      </div>
    </div>
  );
}

const TABS = [['confirmed', 'Para entregar'], ['delivered', 'Kits abiertos'], ['settled', 'Cerrados'], ['cancelled', 'Cancelados']];

export default function AdminOrders() {
  const [tab, setTab] = useState('confirmed');
  const { data, error, reload } = useApi(`/admin/orders?status=${tab}`);
  const counts = useApi('/admin/counts');
  const [closing, setClosing] = useState(null);
  const { busy, msg, run } = useAction();
  const done = () => { reload(); counts.reload(); refreshCounts(); };
  const tabCount = { confirmed: counts.data?.orders_to_deliver, delivered: counts.data?.kit_changes };

  return (
    <div>
      <h1>Pedidos</h1>
      <p className="muted small">Acá llega cada pedido y cada pedido de cambios del kit, con la ficha de la vendedora y de su jefa zonal.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`btn small ${tab === k ? '' : 'secondary'}`} onClick={() => { setTab(k); setClosing(null); }}>
            {l}{tabCount[k] > 0 && <span className="tab-count">{tabCount[k]}</span>}
          </button>
        ))}
      </div>
      {tab === 'delivered' && counts.data?.kit_changes > 0 && <p className="small">{counts.data.kit_changes} {counts.data.kit_changes === 1 ? 'kit tiene' : 'kits tienen'} cambios pedidos para la segunda visita.</p>}
      <Notice msg={msg} />
      {closing && <CloseKit order={closing} onCancel={() => setClosing(null)} onDone={() => { setClosing(null); done(); }} />}
      {!data ? <Loading error={error} /> : data.length === 0 ? <p className="muted">No hay pedidos.</p> : (
        <div className="stack">
          {data.map((o) => (
            <div key={o.id} className={`card ${o.change_request && o.status === 'delivered' ? 'highlight' : ''}`}>
              <div className="row between">
                <div>
                  <strong>Pedido #{o.id}</strong> {o.kind === 'kit' && <Badge tone="amarillo">Kit</Badge>}{' '}
                  {o.change_request && o.status === 'delivered' && <Badge tone="rojo">Cambios pedidos</Badge>}
                  <div className="muted small">
                    {LABELS.payment_mode[o.payment_mode]} · entrega {fecha(o.delivered_at ?? o.delivery_date)}{' '}
                    {o.deliver_to === 'leader' ? 'en casa de la jefa zonal' : 'en el domicilio de la vendedora'}
                  </div>
                </div>
                <strong>{pesos(o.total)}</strong>
              </div>
              <div className="small" style={{ marginTop: 6 }}>{(o.items ?? []).map((i) => `${i.qty - (i.returned_qty ?? 0)} × ${i.product}`).join(' · ')}</div>
              <ChangeSummary o={o} />
              <Profiles o={o} />
              <div className="row" style={{ marginTop: 10 }}>
                {o.status === 'confirmed' && <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/orders/${o.id}/deliver`, { method: 'POST' }).then(done), `Pedido #${o.id} entregado.`)}>Marcar entregado</button>}
                {o.status === 'confirmed' && <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/orders/${o.id}/cancel`, { method: 'POST' }).then(done))}>Cancelar</button>}
                {o.kind === 'kit' && o.status === 'delivered' && <button className="btn small" onClick={() => { setClosing(o); window.scrollTo(0, 0); }}>Segunda visita</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
