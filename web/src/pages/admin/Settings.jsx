import { useState } from 'react';
import { api } from '../../api.js';
import { pesos, toCents } from '../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../components/ui.jsx';

function Levels() {
  const { data, error, reload } = useApi('/admin/levels');
  const [edit, setEdit] = useState({});
  const { busy, msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const val = (l, k) => edit[l.code]?.[k] ?? (k === 'credit_limit' ? l[k] / 100 : l[k]);
  const set = (l, k) => (e) => setEdit({ ...edit, [l.code]: { ...edit[l.code], [k]: e.target.value } });
  const save = (l) => run(() => api(`/admin/levels/${l.code}`, {
    method: 'PUT',
    body: { credit_limit: toCents(val(l, 'credit_limit')), term_days: Number(val(l, 'term_days')), early_discount_pct: Number(val(l, 'early_discount_pct')), required_clean_orders: Number(val(l, 'required_clean_orders')) },
  }).then(reload), `Nivel ${l.name} guardado.`);

  return (
    <div className="card table-wrap">
      <h3>Niveles de confianza</h3>
      <Notice msg={msg} />
      <table className="responsive">
        <thead><tr><th>Nivel</th><th>Cupo ($)</th><th>Plazo (días)</th><th>Descuento (%)</th><th>Pedidos sin mora para llegar</th><th /></tr></thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.code}>
              <td data-label="Nivel"><strong>{l.name}</strong></td>
              <td data-label="Cupo ($)"><input inputMode="decimal" value={val(l, 'credit_limit')} onChange={set(l, 'credit_limit')} /></td>
              <td data-label="Plazo (días)"><input inputMode="numeric" value={val(l, 'term_days')} onChange={set(l, 'term_days')} /></td>
              <td data-label="Descuento (%)"><input inputMode="decimal" value={val(l, 'early_discount_pct')} onChange={set(l, 'early_discount_pct')} /></td>
              <td data-label="Pedidos sin mora"><input inputMode="numeric" value={val(l, 'required_clean_orders')} onChange={set(l, 'required_clean_orders')} /></td>
              <td><button className="btn small" disabled={busy} onClick={() => save(l)}>Guardar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FIELDS = {
  kit: [['maxUnits', 'Máximo de productos'], ['maxAmount', 'Monto máximo ($)'], ['followUpDays', 'Días hasta preguntar por cambios']],
  commissions: [['tier1Pct', '% referidas directas'], ['tier2Pct', '% segundo nivel'], ['minActiveToEarn', 'Activas para cobrar'], ['minActiveForLeader', 'Activas para jefa zonal'], ['activeWindowDays', 'Días para contar como activa']],
  mora: [['reminderDaysBefore', 'Recordatorio, días antes'], ['leaderAlertDay', 'Aviso a jefa, día de atraso'], ['surchargeDay', 'Recargo, día de atraso'], ['surchargePct', 'Recargo (%)'], ['blockDay', 'Bloqueo de pedidos, día'], ['adminAlertDay', 'Alerta a administración, día'], ['levelDownDay', 'Baja de nivel, día'], ['badDebtDay', 'Incobrable, día'], ['lateToleranceDays', 'Atraso tolerado para subir de nivel']],
  delivery: [['minBusinessDays', 'Entrega mínima (días hábiles)'], ['maxBusinessDays', 'Entrega máxima (días hábiles)']],
};
// Campos de dinero: se guardan en centavos y se muestran en pesos.
const MONEY = new Set(['maxAmount']);
const shown = (f, v) => (MONEY.has(f) ? v / 100 : v);
const stored = (f, v) => (MONEY.has(f) ? toCents(v) : Number(v));

const TITLES = { kit: 'Kit de arranque', commissions: 'Comisiones', mora: 'Mora y recargos', delivery: 'Entregas' };

function Rules() {
  const { data, error, reload } = useApi('/admin/settings');
  const [edit, setEdit] = useState({});
  const { busy, msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  return (
    <div className="grid two">
      {Object.entries(FIELDS).map(([key, fields]) => (
        <div key={key} className="card stack">
          <h3>{TITLES[key]}</h3>
          {msg?.key === key && <Notice msg={msg} />}
          {fields.map(([f, label]) => (
            <div key={f}>
              <label htmlFor={`${key}-${f}`}>{label}</label>
              <input id={`${key}-${f}`} inputMode="decimal" value={edit[key]?.[f] ?? shown(f, data[key][f])} onChange={(e) => setEdit({ ...edit, [key]: { ...edit[key], [f]: e.target.value } })} />
            </div>
          ))}
          <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/settings/${key}`, {
            method: 'PUT', body: Object.fromEntries(fields.map(([f]) => [f, edit[key]?.[f] != null ? stored(f, edit[key][f]) : data[key][f]])),
          }).then(reload), 'Guardado.')}>Guardar</button>
        </div>
      ))}
      {msg && !msg.key && <Notice msg={msg} />}
    </div>
  );
}

function Products() {
  const { data, error, reload } = useApi('/products');
  const [form, setForm] = useState({ sku: '', name: '', price: '', suggested_price: '', stock: '' });
  const { busy, msg, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(() => api('/admin/products', { method: 'POST', body: { ...form, price: toCents(form.price), suggested_price: toCents(form.suggested_price), stock: Number(form.stock || 0) } })
      .then(() => { setForm({ sku: '', name: '', price: '', suggested_price: '', stock: '' }); reload(); }), 'Producto guardado.');
  };
  return (
    <div className="card">
      <h3>Productos</h3>
      <form className="grid three" onSubmit={save} style={{ marginBottom: 12 }}>
        <input placeholder="Código (SKU)" value={form.sku} onChange={set('sku')} required />
        <input placeholder="Nombre" value={form.name} onChange={set('name')} required />
        <input placeholder="Precio a vendedora $" inputMode="decimal" value={form.price} onChange={set('price')} required />
        <input placeholder="Precio sugerido $" inputMode="decimal" value={form.suggested_price} onChange={set('suggested_price')} required />
        <input placeholder="Stock" inputMode="numeric" value={form.stock} onChange={set('stock')} />
        <button className="btn" disabled={busy}>Agregar o actualizar</button>
      </form>
      <Notice msg={msg} />
      <p className="muted small">Con el mismo código se actualiza el producto existente.</p>
      {!data ? <Loading error={error} /> : (
        <ul className="list">
          {data.map((p) => (
            <li key={p.id} className="row between">
              <button type="button" className="btn secondary small" onClick={() => setForm({ sku: p.sku, name: p.name, price: String(p.price / 100), suggested_price: String(p.suggested_price / 100), stock: String(p.stock) })}>{p.sku}</button>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span>{pesos(p.price)} <span className="muted small">/ {pesos(p.suggested_price)}</span></span>
              <Badge tone={p.stock < 5 ? 'amarillo' : 'gris'}>stock {p.stock}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Commissions() {
  const { data, error, reload } = useApi('/admin/settlements');
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const [period, setPeriod] = useState(lastMonth);
  const [method, setMethod] = useState('balance');
  const { busy, msg, run } = useAction();
  return (
    <div className="card stack">
      <h3>Liquidación de comisiones</h3>
      <p className="muted small">Cierra el mes: quien tuvo 5 o más referidas activas cobra; al resto se le anulan las comisiones de ese mes.</p>
      <Notice msg={msg} />
      <div className="row">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ maxWidth: 200 }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="balance">Como saldo a favor</option>
          <option value="transfer">Por transferencia</option>
        </select>
        <button className="btn" disabled={busy} onClick={() => run(() => api('/admin/commissions/close', { method: 'POST', body: { period, method } }).then(reload), `Mes ${period} liquidado.`)}>Liquidar mes</button>
      </div>
      {!data ? <Loading error={error} /> : data.length > 0 && (
        <ul className="list">
          {data.map((s) => (
            <li key={s.id} className="row between">
              <span>{s.period} · {s.name}</span>
              <span className="row">
                <strong>{pesos(s.total)}</strong>
                {s.status === 'paid' ? <Badge tone="verde">Pagada</Badge> : (
                  <button className="btn small" onClick={() => run(() => api(`/admin/settlements/${s.id}/paid`, { method: 'POST' }).then(reload))}>Marcar pagada</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div>
      <h1>Ajustes</h1>
      <Levels />
      <Commissions />
      <Products />
      <Rules />
    </div>
  );
}
