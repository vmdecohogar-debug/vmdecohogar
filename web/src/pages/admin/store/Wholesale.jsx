import { useState } from 'react';
import { api } from '../../../api.js';
import { fecha, pesos, toCents } from '../../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../../components/ui.jsx';

const STATUS = { pending: ['Pendiente', 'amarillo'], active: ['Habilitado', 'verde'], blocked: ['Pausado', 'rojo'] };

function NewCustomer({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', business: '', phone: '', city: '', password: '' });
  const { busy, msg, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const u = await api('/admin/store/wholesale', { method: 'POST', body: f });
      onDone(u.tempPassword
        ? `Cuenta creada. Pasale su contraseña: ${u.tempPassword} (entra con su celular en /ingresar).`
        : 'Cuenta creada. Entra con su celular y la contraseña que pusiste.');
    });
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Dar de alta un mayorista</h2>
      <Notice msg={msg} />
      <div className="grid two">
        <div><label htmlFor="n-name">Nombre</label><input id="n-name" value={f.name} onChange={set('name')} required /></div>
        <div><label htmlFor="n-bus">Comercio (opcional)</label><input id="n-bus" value={f.business} onChange={set('business')} /></div>
        <div><label htmlFor="n-phone">Celular</label><input id="n-phone" inputMode="tel" value={f.phone} onChange={set('phone')} required /></div>
        <div><label htmlFor="n-city">Localidad</label><input id="n-city" value={f.city} onChange={set('city')} /></div>
      </div>
      <div><label htmlFor="n-pass">Contraseña (vacío = se genera una)</label><input id="n-pass" value={f.password} onChange={set('password')} /></div>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function MinimumSettings({ settings, onSaved }) {
  const [value, setValue] = useState(String((settings.minOrder ?? 5000000) / 100));
  const { busy, msg, run } = useAction();
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/store/wholesale/minimum', { method: 'PUT', body: { minOrder: value === '' ? 0 : toCents(value) } });
      onSaved();
    }, 'Compra mínima guardada.');
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h2>Compra mínima mayorista</h2>
      <p className="muted small">
        Los mayoristas ven una barra en el carrito con cuánto les falta y recién pueden pagar al llegar a este monto (sin contar el envío).
        Poné 0 para que no haya mínimo. Para sacárselo a alguien en particular, usá “Sacar mínimo” en la lista de abajo.
      </p>
      <Notice msg={msg} />
      <div className="row">
        <span>$</span>
        <input id="w-min" aria-label="Monto mínimo en pesos" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 160 }} />
        <button className="btn small" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
      <p className="muted small">Ahora: {settings.minOrder ? pesos(settings.minOrder) : 'sin mínimo'}</p>
    </form>
  );
}

export default function Wholesale() {
  const { data, error, reload } = useApi('/admin/store/wholesale');
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const { busy, msg, run, setMsg } = useAction();
  if (!data) return <Loading error={error} />;
  const { customers, settings } = data;
  const link = settings.inviteCode ? `${window.location.origin}/mayoristas?inv=${settings.inviteCode}` : null;
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const pending = customers.filter((c) => c.status === 'pending').length;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Mayoristas</h1>
        <button className="btn small" onClick={() => setAdding(true)}>Dar de alta</button>
      </div>
      <Notice msg={msg} />
      {adding && <NewCustomer onDone={(text) => { setAdding(false); setMsg({ type: 'ok', text }); reload(); }} onCancel={() => setAdding(false)} />}

      <section className="card stack">
        <h2>Enlace para registrarse</h2>
        <p className="muted small">Quien se registra con este enlace queda habilitado al instante. Mandalo solo a quien elijas. Si se comparte de más, generá uno nuevo y el anterior deja de funcionar.</p>
        {link ? (
          <div className="row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Enlace de invitación" style={{ flex: 1, minWidth: 220 }} />
            <button type="button" className="btn secondary small" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
        ) : <p className="muted">Todavía no generaste un enlace.</p>}
        <div className="row">
          <button type="button" className="btn small" disabled={busy} onClick={() => run(() => api('/admin/store/wholesale/invite', { method: 'POST', body: {} }).then(reload))}>
            {link ? 'Generar enlace nuevo' : 'Generar enlace'}
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.requireApproval !== false} disabled={busy}
            onChange={(e) => run(() => api('/admin/store/wholesale/settings', { method: 'PUT', body: { requireApproval: e.target.checked } }).then(reload))} />
          Quien se registra sin el enlace (desde /mayoristas) queda pendiente hasta que lo apruebes
        </label>
      </section>

      <MinimumSettings settings={settings} onSaved={reload} />

      <p className="muted small">{customers.length} cuentas{pending ? ` · ${pending} esperando aprobación` : ''}</p>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="responsive admin-products">
          <thead><tr><th>Cliente</th><th>Contacto</th><th>Pedidos</th><th>Estado</th><th>Compra mínima</th><th /></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td data-label="Cliente"><strong>{c.name}</strong>{c.business && <div className="muted small">{c.business}</div>}<div className="muted small">desde {fecha(c.created_at)}</div></td>
                <td data-label="Contacto">
                  <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{c.phone}</a>
                  {c.city && <div className="muted small">{c.city}</div>}
                </td>
                <td data-label="Pedidos">{c.orders}</td>
                <td data-label="Estado"><Badge tone={STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0] ?? c.status}</Badge></td>
                <td data-label="Compra mínima">
                  {c.no_minimum ? <Badge tone="verde">Sin mínimo</Badge> : <span className="muted small">{settings.minOrder ? pesos(settings.minOrder) : 'Sin mínimo'}</span>}
                  <div>
                    <button type="button" className="btn secondary small" style={{ marginTop: 4 }} disabled={busy}
                      onClick={() => run(() => api(`/admin/store/wholesale/${c.id}/no-minimum`, { method: 'POST', body: { noMinimum: !c.no_minimum } }).then(reload),
                        c.no_minimum ? `${c.name} vuelve a tener compra mínima.` : `${c.name} ya puede comprar sin mínimo.`)}>
                      {c.no_minimum ? 'Poner mínimo' : 'Sacar mínimo'}
                    </button>
                  </div>
                </td>
                <td data-label="">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {c.status !== 'active' && <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/store/wholesale/${c.id}/status`, { method: 'POST', body: { status: 'active' } }).then(reload))}>{c.status === 'pending' ? 'Aprobar' : 'Reactivar'}</button>}
                    {c.status !== 'blocked' && <button className="btn secondary small" disabled={busy} onClick={() => run(() => api(`/admin/store/wholesale/${c.id}/status`, { method: 'POST', body: { status: 'blocked' } }).then(reload))}>Pausar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={6} className="muted">Todavía no hay mayoristas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
