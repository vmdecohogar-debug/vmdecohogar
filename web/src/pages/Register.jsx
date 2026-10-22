import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Notice, useAction } from '../components/ui.jsx';

export default function Register() {
  const params = useParams();
  const [form, setForm] = useState({ name: '', dni: '', phone: '', address: '', password: '', referralCode: params.code ?? '', whatsappOptIn: true });
  const [referrer, setReferrer] = useState(null);
  const [done, setDone] = useState(null);
  const { busy, msg, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    const code = form.referralCode.trim();
    if (code.length < 5) return setReferrer(null);
    const t = setTimeout(() => api(`/referral/${encodeURIComponent(code)}`).then((r) => setReferrer(r.name), () => setReferrer(null)), 300);
    return () => clearTimeout(t);
  }, [form.referralCode]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => setDone(await api('/auth/register', { method: 'POST', body: form })));
  };

  if (done) {
    return (
      <div className="auth">
        <img className="logo" src="/logo.jpg" alt="VM Bazar y Deco" />
        <div className="card stack">
          <h2>¡Listo, {done.name.split(' ')[0]}!</h2>
          <p>Tu cuenta quedó pendiente de aprobación. Te avisamos por WhatsApp cuando esté activa.</p>
          <p>Tu código de referida es <span className="code">{done.referralCode}</span></p>
          <Link className="btn block" to="/ingresar" style={{ textAlign: 'center', textDecoration: 'none' }}>Ir a ingresar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <img className="logo" src="/logo.jpg" alt="VM Bazar y Deco" />
      <h1 style={{ textAlign: 'center' }}>Sumate a la red</h1>
      <form className="card stack" onSubmit={submit}>
        <Notice msg={msg} />
        <div>
          <label htmlFor="ref">Código de quien te invitó</label>
          <input id="ref" value={form.referralCode} onChange={set('referralCode')} placeholder="ANA-3F2A" autoCapitalize="characters" />
          {referrer && <p className="muted small">Te invitó {referrer}.</p>}
        </div>
        <div><label htmlFor="name">Nombre y apellido</label><input id="name" value={form.name} onChange={set('name')} autoComplete="name" required /></div>
        <div><label htmlFor="dni">DNI</label><input id="dni" inputMode="numeric" value={form.dni} onChange={set('dni')} required /></div>
        <div><label htmlFor="phone">Celular con WhatsApp</label><input id="phone" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="11 2345 6789" required /></div>
        <div><label htmlFor="addr">Dirección de entrega</label><input id="addr" value={form.address} onChange={set('address')} autoComplete="street-address" /></div>
        <div><label htmlFor="pw">Contraseña</label><input id="pw" type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={set('password')} required /></div>
        <label className="check">
          <input type="checkbox" checked={form.whatsappOptIn} onChange={set('whatsappOptIn')} />
          Acepto recibir avisos de pedidos, vencimientos y pagos por WhatsApp.
        </label>
        <button className="btn block" disabled={busy}>{busy ? 'Enviando…' : 'Crear cuenta'}</button>
      </form>
      <p className="muted" style={{ textAlign: 'center' }}>¿Ya tenés cuenta? <Link to="/ingresar">Ingresá</Link></p>
    </div>
  );
}
