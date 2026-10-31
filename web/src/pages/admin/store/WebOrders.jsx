import { useState } from 'react';
import { api } from '../../../api.js';
import { fecha, pesos } from '../../../format.js';
import { Badge, Loading, Notice, Stat, useAction, useApi } from '../../../components/ui.jsx';

const STATUS = {
  new: ['Nuevo', 'amarillo'],
  ready: ['Listo para entrega', 'verde'],
  delivered: ['Entregado', 'gris'],
  cancelled: ['Cancelado', 'rojo'],
};
const PAYMENT = {
  pending: ['Pago pendiente', 'amarillo'],
  proof_sent: ['Comprobante enviado: revisalo', 'amarillo'],
  paid: ['Pagado', 'verde'],
  rejected: ['Pago rechazado', 'rojo'],
};
const METHOD = { mercadopago: 'Mercado Pago', transfer: 'Transferencia' };
const TABS = [
  ['new', 'Nuevos'],
  ['shopping', 'A comprar'],
  ['ready', 'Listos'],
  ['delivered', 'Entregados'],
  ['cancelled', 'Cancelados'],
];

// Celular guardado como +54 11…: para WhatsApp en Argentina va 549 + número.
const waPhone = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.startsWith('54') && !d.startsWith('549') ? `549${d.slice(2)}` : d;
};
const showPhone = (phone) => String(phone ?? '').replace(/^\+54/, '');
const hora = (d) => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

function OrderCard({ o, busy, act }) {
  const [st, tone] = STATUS[o.status];
  const [pay, payTone] = PAYMENT[o.payment_status];
  const status = (to, label, kind = 'secondary') => (
    <button className={`btn small ${kind}`} disabled={busy} onClick={() => act(`/admin/store/orders/${o.id}/status`, { status: to })}>{label}</button>
  );
  const payment = (to, label) => (
    <button className="btn small secondary" disabled={busy} onClick={() => act(`/admin/store/orders/${o.id}/payment`, { paymentStatus: to })}>{label}</button>
  );
  return (
    <article className="card order-card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Pedido #{o.id}</h2>
        <span className="muted small">{fecha(o.created_at)} · {hora(o.created_at)}</span>
      </div>
      <div className="row" style={{ gap: 6, margin: '6px 0 10px' }}>
        <Badge tone={tone}>{st}</Badge>
        <Badge tone={payTone}>{pay}</Badge>
        <Badge>{METHOD[o.payment_method]}</Badge>
        {o.price_type === 'wholesale' && <Badge>Mayorista</Badge>}
      </div>

      <div className="order-client">
        <strong>{o.customer_name}</strong>
        <div>{o.address}{o.city ? `, ${o.city}` : ''}</div>
        <div>
          <a href={`https://wa.me/${waPhone(o.phone)}`} target="_blank" rel="noopener noreferrer">WhatsApp {showPhone(o.phone)}</a>
          {' · '}<a href={`tel:${o.phone}`}>Llamar</a>
        </div>
        <div className="muted small">Envío: {o.zone_name}</div>
        {o.notes && <div className="small">Nota: {o.notes}</div>}
      </div>

      <ul className="list order-items">
        {o.items.map((i) => (
          <li key={`${i.sku}-${i.name}`} className="row between">
            <span><strong>{i.qty} ×</strong> {i.name} <span className="muted small">{i.sku}</span></span>
            <span>{pesos(i.qty * i.unit_price)}</span>
          </li>
        ))}
      </ul>

      <dl className="order-totals">
        <dt>Productos</dt><dd>{pesos(o.subtotal)}</dd>
        <dt>Envío</dt><dd>{Number(o.shipping) ? pesos(o.shipping) : 'Sin cargo'}</dd>
        <dt><strong>Total cobrado</strong></dt><dd><strong>{pesos(o.total)}</strong></dd>
        <dt className="muted">Costo de la mercadería</dt><dd className="muted">{pesos(o.cost_total)}</dd>
        <dt><strong>Tu ganancia</strong></dt><dd className="profit"><strong>{pesos(o.profit)}</strong></dd>
      </dl>
      {o.missing_cost > 0 && (
        <p className="notice warn small">
          {o.missing_cost === 1 ? 'Un producto no tenía' : `${o.missing_cost} productos no tenían`} costo cargado, así que la ganancia real es menor. Cargale el costo en Productos para los próximos pedidos.
        </p>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {o.status === 'new' && status('ready', 'Listo para entrega', '')}
        {o.status === 'ready' && status('delivered', 'Marcar entregado', '')}
        {o.status === 'ready' && status('new', 'Volver a nuevos')}
        {o.status === 'delivered' && status('ready', 'Volver a listos')}
        {o.status === 'cancelled' && status('new', 'Reactivar')}
        {o.status !== 'cancelled' && o.payment_status !== 'paid' && payment('paid', 'Confirmar pago')}
        {o.status !== 'cancelled' && o.payment_status === 'proof_sent' && payment('rejected', 'Rechazar comprobante')}
        {o.payment_status === 'paid' && o.payment_method === 'transfer' && payment('pending', 'Desmarcar pago')}
        <a className="btn small secondary" href={`/pedido/${o.public_token}`} target="_blank" rel="noopener noreferrer">Ver como cliente</a>
        {(o.status === 'new' || o.status === 'ready') && (
          <button className="btn small secondary danger-text" disabled={busy}
            onClick={() => window.confirm(`¿Cancelar el pedido #${o.id}?`) && act(`/admin/store/orders/${o.id}/status`, { status: 'cancelled' })}>Cancelar pedido</button>
        )}
      </div>
    </article>
  );
}

function Shopping() {
  const { data, error } = useApi('/admin/store/orders/shopping');
  if (!data) return <Loading error={error} />;
  if (!data.items.length) return <div className="card muted">No hay nada para comprar: todos los pedidos nuevos ya están listos para entrega.</div>;
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Lista para comprar o separar</h2>
        <button className="btn small secondary no-print" onClick={() => window.print()}>Imprimir</button>
      </div>
      <p className="muted small">Suma todo lo de los pedidos nuevos. Cuando marcás un pedido como listo para entrega, sus productos salen de esta lista.</p>
      <ul className="list shopping">
        {data.items.map((i) => (
          <li key={i.key} className="row between">
            <span className="row" style={{ gap: 10, minWidth: 0 }}>
              {i.image_url ? <img src={i.image_url} alt="" className="thumb" /> : <span className="thumb" />}
              <span style={{ minWidth: 0 }}>
                {i.name} <span className="muted small">{i.sku}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {i.orders === 1 ? '1 pedido' : `${i.orders} pedidos`}
                  {i.stock > 0 ? ` · tenés ${i.stock} en stock` : ''}
                  {' · '}{i.missing_cost ? 'sin costo cargado' : `costo ${pesos(i.cost)}`}
                </span>
              </span>
            </span>
            <strong className="shopping-qty">{i.qty}</strong>
          </li>
        ))}
        <li className="row between"><strong>Total: {data.units} unidades</strong><strong>{pesos(data.cost)}</strong></li>
      </ul>
    </div>
  );
}

function Sold({ s }) {
  return (
    <div className="card tint">
      <h2>Total vendido</h2>
      <p className="muted small">Cuenta los pedidos listos para entrega y los entregados.</p>
      <div className="table-wrap">
        <table className="responsive">
          <thead><tr><th /><th>Pedidos</th><th>Productos</th><th>Envíos</th><th>Costo</th><th>Ganancia</th></tr></thead>
          <tbody>
            {[['Este mes', s.month], ['Desde el inicio', s.all]].map(([label, r]) => (
              <tr key={label}>
                <td><strong>{label}</strong></td>
                <td data-label="Pedidos">{r.orders}</td>
                <td data-label="Productos">{pesos(r.products)}</td>
                <td data-label="Envíos">{pesos(r.shipping)}</td>
                <td data-label="Costo">{pesos(r.cost)}</td>
                <td data-label="Ganancia"><strong>{pesos(r.profit)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WebOrders() {
  const [tab, setTab] = useState('new');
  const { data, error, reload } = useApi(tab === 'shopping' ? '/admin/store/orders?status=new' : `/admin/store/orders?status=${tab}`);
  const { busy, msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const { summary: s } = data;
  const c = s.counts;
  const act = (path, body) => run(() => api(path, { method: 'POST', body }).then(reload));
  return (
    <div>
      <h1>Pedidos de la tienda</h1>
      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Para preparar" value={c.new ?? 0} />
        <Stat label="Comprobantes a revisar" value={c.to_confirm ?? 0} />
        <Stat label="Vendido este mes" value={pesos(s.month.total)} hint={s.month.orders === 1 ? '1 pedido' : `${s.month.orders} pedidos`} />
        <Stat label="Ganancia del mes" value={pesos(s.month.profit)} />
      </div>
      <div className="seg" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}{k !== 'shopping' && c[k] ? ` (${c[k]})` : ''}
          </button>
        ))}
      </div>
      <Notice msg={msg} />
      {tab === 'shopping' ? <Shopping /> : (
        <>
          {data.orders.length === 0 && (
            <div className="card muted">
              {tab === 'new' ? 'No hay pedidos nuevos. Cuando alguien compre en la tienda, aparece acá.' : 'No hay pedidos en esta sección.'}
            </div>
          )}
          <div className="orders-grid">
            {data.orders.map((o) => <OrderCard key={o.id} o={o} busy={busy} act={act} />)}
          </div>
        </>
      )}
      {(tab === 'ready' || tab === 'delivered') && <Sold s={s} />}
    </div>
  );
}
