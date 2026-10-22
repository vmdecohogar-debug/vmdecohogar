import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, fecha, pesos, toCents } from '../../format.js';
import { Loading, Notice, Semaphore, useAction, useApi } from '../../components/ui.jsx';

function RegisterPayment({ ob, onDone }) {
  const [amount, setAmount] = useState(String(ob.balance / 100));
  const [method, setMethod] = useState('cash');
  const { busy, msg, run } = useAction();
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <Notice msg={msg} />
      <input style={{ maxWidth: 140 }} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monto" />
      <select style={{ maxWidth: 170 }} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Medio">
        <option value="cash">Efectivo</option><option value="mercadopago">Mercado Pago</option><option value="transfer">Transferencia</option>
      </select>
      <button className="btn small" disabled={busy} onClick={() => run(() => api('/payments', { method: 'POST', body: { obligationId: ob.id, amount: toCents(amount), method } }).then(onDone))}>Acreditar</button>
    </div>
  );
}

export default function AdminPayments() {
  const reported = useApi('/admin/payments?status=reported');
  const [tab, setTab] = useState('open');
  const obs = useApi(`/admin/obligations?status=${tab}`);
  const [open, setOpen] = useState(null);
  const { busy, msg, run } = useAction();
  const reloadAll = () => { reported.reload(); obs.reload(); };

  return (
    <div>
      <h1>Pagos</h1>
      <Notice msg={msg} />
      <div className="card">
        <h3>Para confirmar</h3>
        <p className="muted small">Efectivo que cobraron las jefas zonales y transferencias informadas por las vendedoras.</p>
        {!reported.data ? <Loading error={reported.error} /> : reported.data.length === 0 ? <p className="muted">Nada pendiente.</p> : (
          <ul className="list">
            {reported.data.map((p) => (
              <li key={p.id} className="row between">
                <div>
                  <strong>{pesos(p.amount)}</strong> · {p.seller_name}
                  <div className="muted small">{LABELS.method[p.method]}{p.external_ref ? ` · op. ${p.external_ref}` : ''}{p.collected_by_name && p.collected_by_name !== p.seller_name ? ` · cobró ${p.collected_by_name}` : ''} · {fecha(p.created_at)}</div>
                </div>
                <div className="row">
                  <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/payments/${p.id}/credit`, { method: 'POST' }).then(reloadAll), 'Pago acreditado.')}>Confirmar</button>
                  <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/payments/${p.id}/reject`, { method: 'POST' }).then(reloadAll))}>Rechazar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn small ${tab === 'open' ? '' : 'secondary'}`} onClick={() => setTab('open')}>Pagos faltantes</button>
        <button className={`btn small ${tab === 'paid' ? '' : 'secondary'}`} onClick={() => setTab('paid')}>Pagos realizados</button>
      </div>
      <div className="card table-wrap">
        {!obs.data ? <Loading error={obs.error} /> : obs.data.length === 0 ? <p className="muted">No hay deudas en esta lista.</p> : (
          <table className="responsive">
            <thead><tr><th>Vendedora</th><th>Pedido</th><th>Tipo</th><th>Vence</th><th>{tab === 'open' ? 'Saldo' : 'Monto'}</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {obs.data.map((o) => (
                <tr key={o.id}>
                  <td data-label="Vendedora">{o.seller_name}</td>
                  <td data-label="Pedido">#{o.order_id}</td>
                  <td data-label="Tipo">{LABELS.ob_kind[o.kind]}</td>
                  <td data-label="Vence">{fecha(o.due_date)}{o.days_late > 0 && <div className="muted small">{o.days_late} días de atraso</div>}</td>
                  <td data-label={tab === 'open' ? 'Saldo' : 'Monto'}>{pesos(tab === 'open' ? o.balance : o.amount + o.surcharge)}{o.surcharge > 0 && <div className="muted small">recargo {pesos(o.surcharge)}</div>}</td>
                  <td data-label="Estado">{o.status === 'bad_debt' ? <span className="badge rojo">Incobrable</span> : <Semaphore value={o.semaphore} />}</td>
                  <td>
                    {tab === 'open' && <button className="btn secondary small" onClick={() => setOpen(open === o.id ? null : o.id)}>Registrar pago</button>}
                    {open === o.id && <RegisterPayment ob={o} onDone={() => { setOpen(null); reloadAll(); }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
