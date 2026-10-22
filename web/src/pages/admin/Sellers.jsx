import { useState } from 'react';
import { api } from '../../api.js';
import { LABELS, pesos, toCents } from '../../format.js';
import { Badge, Loading, Notice, useAction, useApi } from '../../components/ui.jsx';

function Override({ seller, onDone }) {
  const [level, setLevel] = useState(seller.level_code);
  const [limit, setLimit] = useState(seller.credit_limit_override != null ? String(seller.credit_limit_override / 100) : '');
  const [reason, setReason] = useState('');
  const { busy, msg, run } = useAction();
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <Notice msg={msg} />
      <div className="grid three">
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Nivel">
          {['inicial', 'bronce', 'plata', 'oro'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input inputMode="decimal" placeholder="Cupo manual (vacío = el del nivel)" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <input placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/sellers/${seller.id}/override`, {
        method: 'POST', body: { levelCode: level, creditLimitOverride: limit === '' ? null : toCents(limit), reason },
      }).then(onDone))}>Guardar</button>
    </div>
  );
}

export default function AdminSellers() {
  const { data, error, reload } = useApi('/admin/sellers');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const { busy, msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const list = data.filter((s) => `${s.name} ${s.phone} ${s.dni} ${s.referral_code}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1>Vendedoras</h1>
      <Notice msg={msg} />
      <input placeholder="Buscar por nombre, teléfono, DNI o código" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />
      <div className="card">
        <ul className="list">
          {list.map((s) => (
            <li key={s.id}>
              <div className="row between">
                <div>
                  <strong>{s.name}</strong> {s.is_leader && <Badge tone="verde">Jefa zonal</Badge>}
                  <div className="muted small">
                    {s.phone} · DNI {s.dni} · {s.referral_code} · nivel {s.level_code}
                    {s.referred_by_name && ` · invitada por ${s.referred_by_name}`}
                    {s.balance_credit > 0 && ` · saldo a favor ${pesos(s.balance_credit)}`}
                  </div>
                </div>
                <div className="row">
                  <Badge tone={s.status === 'active' ? 'verde' : s.status === 'pending' ? 'amarillo' : 'rojo'}>{LABELS.user_status[s.status]}</Badge>
                  {s.status === 'pending' && <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/sellers/${s.id}/approve`, { method: 'POST', body: {} }).then(reload), `${s.name} aprobada.`)}>Aprobar</button>}
                  {s.status === 'active' && <button className="btn secondary small" onClick={() => run(() => api(`/admin/sellers/${s.id}/status`, { method: 'POST', body: { status: 'blocked' } }).then(reload))}>Bloquear</button>}
                  {s.status === 'blocked' && <button className="btn secondary small" onClick={() => run(() => api(`/admin/sellers/${s.id}/status`, { method: 'POST', body: { status: 'active' } }).then(reload))}>Reactivar</button>}
                  <button className="btn secondary small" onClick={() => setOpen(open === s.id ? null : s.id)}>Nivel y cupo</button>
                </div>
              </div>
              {open === s.id && <Override seller={s} onDone={() => { setOpen(null); reload(); }} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
