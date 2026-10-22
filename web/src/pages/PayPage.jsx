import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { pesos, toCents } from '../format.js';
import { Loading, Notice, useAction, useApi } from '../components/ui.jsx';

// Página de pago de una deuda: link de Mercado Pago o aviso de transferencia.
export default function PayPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error } = useApi(`/obligations/${id}/pay-link`);
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState('');
  const { busy, msg, run } = useAction();

  if (!data) return <Loading error={error} />;

  const report = (e) => {
    e.preventDefault();
    run(() => api('/payments', { method: 'POST', body: { obligationId: Number(id), amount: toCents(amount || data.amount / 100), method: 'transfer', externalRef: ref } }),
      user.role === 'admin' ? 'Pago acreditado.' : 'Listo: avisamos a administración para que lo confirme.');
  };

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>Pagar deuda #{id}</h1>
      <div className="card tint">
        <div className="muted">Saldo a pagar</div>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{pesos(data.amount)}</div>
      </div>
      {data.provider === 'mercadopago' ? (
        <a className="btn block" href={data.url} style={{ textAlign: 'center', textDecoration: 'none' }}>Pagar con Mercado Pago</a>
      ) : (
        <p className="muted">El pago con Mercado Pago se activa cuando se configure la cuenta. Mientras tanto podés pagar en efectivo a tu jefa zonal o por transferencia.</p>
      )}
      <form className="card stack" onSubmit={report}>
        <h3>¿Pagaste por transferencia?</h3>
        <Notice msg={msg} />
        <div><label htmlFor="amt">Monto</label><input id="amt" inputMode="decimal" placeholder={String(data.amount / 100)} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label htmlFor="ref">Número de operación</label><input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} required /></div>
        <button className="btn secondary block" disabled={busy}>Avisar el pago</button>
      </form>
    </div>
  );
}
