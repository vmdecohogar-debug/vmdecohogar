import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { Notice, useAction } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { busy, msg, run } = useAction();

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('/auth/login', { method: 'POST', body: { phone, password } });
      await login(r.token, r.user);
    });
  };

  return (
    <div className="auth">
      <img className="logo" src="/logo.jpg" alt="VM Bazar y Deco" />
      <h1 style={{ textAlign: 'center' }}>Ingresar</h1>
      <form className="card stack" onSubmit={submit}>
        <Notice msg={msg} />
        <div>
          <label htmlFor="phone">Celular</label>
          <input id="phone" inputMode="tel" autoComplete="tel" placeholder="11 2345 6789" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="pw">Contraseña</label>
          <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn block" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="muted" style={{ textAlign: 'center' }}>
        <Link to="/">Volver a la tienda</Link>
      </p>
    </div>
  );
}
