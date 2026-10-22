import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { pesos } from '../../format.js';
import { Loading, Notice, Stat, useAction, useApi } from '../../components/ui.jsx';

export default function AdminHome() {
  const { data, error, reload } = useApi('/admin/dashboard');
  const { busy, msg, run } = useAction();
  if (!data) return <Loading error={error} />;
  const { totals, counts } = data;

  const runDaily = () => run(async () => {
    const r = await api('/admin/run-daily', { method: 'POST' });
    reload();
    return r;
  }, 'Proceso diario ejecutado: recordatorios, atrasos y alertas al día.');

  return (
    <div>
      <h1>Panel de administración</h1>
      <Notice msg={msg} />
      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Por cobrar" value={pesos(totals.owed)} />
        <Stat label="Vencido" value={pesos(totals.overdue)} />
        <Stat label="Cobrado este mes" value={pesos(totals.collectedMonth)} />
        <Stat label="Posible incobrable" value={pesos(totals.bad_debt)} hint="más de 30 días" />
      </div>
      <div className="grid three" style={{ marginBottom: 16 }}>
        <Stat label="Vendedoras activas" value={counts.active} />
        <Stat label="Altas por aprobar" value={counts.pending} hint={counts.pending ? <Link to="/admin/vendedoras">Revisar</Link> : null} />
        <Stat label="Jefas zonales" value={counts.leaders} />
      </div>
      <div className="card stack">
        <h3>Proceso diario</h3>
        <p className="muted">Corre solo todos los días a las 10. Envía recordatorios y avisos de atraso, aplica el recargo, avisa a las jefas zonales y baja niveles por mora. Podés correrlo a mano: no repite avisos.</p>
        <button className="btn" disabled={busy} onClick={runDaily}>Correr ahora</button>
      </div>
    </div>
  );
}
