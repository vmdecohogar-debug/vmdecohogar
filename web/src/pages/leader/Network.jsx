import { useState } from 'react';
import { api } from '../../api.js';
import { fecha, pesos, toCents } from '../../format.js';
import { Badge, Loading, Notice, Semaphore, Stat, useAction, useApi } from '../../components/ui.jsx';

// La jefa zonal registra el efectivo que le entrega una vendedora de su red.
// Se imputa a la deuda pendiente más antigua de esa vendedora.
function CashForm({ member, onDone }) {
  const [amount, setAmount] = useState('');
  const { busy, msg, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(() => api('/payments', { method: 'POST', body: { sellerId: member.id, amount: toCents(amount), method: 'cash' } }).then(onDone));
  };
  return (
    <form className="row" style={{ marginTop: 8 }} onSubmit={submit}>
      <Notice msg={msg} />
      <input style={{ maxWidth: 140 }} inputMode="decimal" placeholder="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <button className="btn small" disabled={busy}>Registrar efectivo</button>
    </form>
  );
}

export default function Network() {
  const { data, error, reload } = useApi('/leader/dashboard');
  const [open, setOpen] = useState(null);
  const { msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const { members, totals, alerts, commissions, cashPending, deliveries } = data;

  return (
    <div>
      <h1>Mi red</h1>
      <Notice msg={msg} />
      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Referidas directas" value={totals.tier1} hint={`${data.activeDirect} activas`} />
        <Stat label="Segundo nivel" value={totals.tier2} />
        <Stat label="Deuda de la red" value={pesos(totals.owed)} />
        <Stat label="En mora" value={totals.late} hint="más de 3 días de atraso" />
      </div>

      {alerts.length > 0 && (
        <div className="card">
          <h3>Alertas de mora</h3>
          <ul className="list">
            {alerts.map((a) => (
              <li key={a.id} className="row between">
                <div><strong>{a.seller_name}</strong><div className="muted small">{a.note} · {fecha(a.created_at)}</div></div>
                {a.status === 'open'
                  ? <button className="btn small" onClick={() => run(() => api(`/leader/alerts/${a.id}`, { method: 'POST', body: {} }).then(reload), 'Marcada como gestionada.')}>Ya la contacté</button>
                  : <Badge tone="verde">Gestionada</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="card">
          <h3>Pedidos que llegan a tu casa</h3>
          <ul className="list">
            {deliveries.map((d) => <li key={d.id} className="row between"><span>{d.seller_name} · #{d.id}{d.kind === 'kit' ? ' (kit)' : ''}</span><span className="muted">{fecha(d.delivery_date)}</span></li>)}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Vendedoras</h3>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id}>
              <div className="row between">
                <div>
                  <strong>{m.name}</strong> <span className="muted small">· {m.level_code}{m.tier === 2 ? ' · 2.º nivel' : ''}</span>
                  <div className="muted small">
                    {m.balance > 0 ? `Debe ${pesos(m.balance)} · vence ${fecha(m.next_due)}` : 'Sin deuda'} · pagó {pesos(m.paid_month)} este mes
                  </div>
                </div>
                <Semaphore value={m.semaphore} />
              </div>
              {m.balance > 0 && (
                <div className="row" style={{ marginTop: 8 }}>
                  <a className="btn secondary small" href={`https://wa.me/${m.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>WhatsApp</a>
                  <button className="btn secondary small" onClick={() => setOpen(open === m.id ? null : m.id)}>Cobré en efectivo</button>
                </div>
              )}
              {open === m.id && <CashForm member={m} onDone={() => { setOpen(null); reload(); }} />}
            </li>
          ))}
        </ul>
      </div>

      {cashPending.length > 0 && (
        <div className="card">
          <h3>Efectivo a rendir</h3>
          <ul className="list">
            {cashPending.map((p) => <li key={p.id} className="row between"><span>{p.seller_name}</span><strong>{pesos(p.amount)}</strong></li>)}
          </ul>
          <p className="muted small">Total {pesos(cashPending.reduce((s, p) => s + p.amount, 0))}. Cuenta como pagado cuando administración confirma que lo recibió.</p>
        </div>
      )}

      <div className="card">
        <h3>Mis comisiones</h3>
        {commissions.length === 0 ? <p className="muted">Todavía no hay comisiones.</p> : (
          <ul className="list">
            {commissions.map((c) => (
              <li key={`${c.period}-${c.tier}-${c.status}`} className="row between">
                <span>{c.period} · {c.tier === 1 ? '3% directas' : '1% segundo nivel'} · {c.payments} pagos</span>
                <span className="row"><strong>{pesos(c.amount)}</strong><Badge tone={c.status === 'settled' ? 'verde' : c.status === 'void' ? 'rojo' : 'amarillo'}>{c.status === 'settled' ? 'Liquidada' : c.status === 'void' ? 'Sin derecho' : 'En curso'}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
