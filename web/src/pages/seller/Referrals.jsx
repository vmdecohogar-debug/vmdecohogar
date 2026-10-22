import { LABELS, pesos } from '../../format.js';
import { Badge, Loading, Stat, useApi } from '../../components/ui.jsx';

export default function Referrals() {
  const { data, error } = useApi('/seller/dashboard');
  if (!data) return <Loading error={error} />;
  const { profile, network, referrals } = data;
  const link = `${window.location.origin}/r/${profile.referralCode}`;
  const share = `https://wa.me/?text=${encodeURIComponent(`¡Sumate a la red de VM Bazar y Deco! Registrate con mi código ${profile.referralCode}: ${link}`)}`;

  return (
    <div>
      <h1>Mis referidas</h1>
      <div className="card tint stack">
        <div className="muted">Tu código</div>
        <div className="code">{profile.referralCode}</div>
        <div className="row">
          <a className="btn" href={share} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Compartir por WhatsApp</a>
          <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(link)}>Copiar link</button>
        </div>
      </div>

      <div className="grid three" style={{ marginBottom: 16 }}>
        <Stat label="Referidas activas" value={network.activeDirect} hint="con un pago en los últimos 30 días" />
        <Stat label="Comisión" value={network.earnsCommission ? 'Activa' : `Faltan ${network.missingToEarn}`} hint="3% de tus referidas y 1% de las de ellas, desde 5 activas" />
        <Stat label="Jefa zonal" value={network.isLeader ? 'Sí' : `Faltan ${network.missingToLeader}`} hint="con 10 activas se habilita tu panel" />
      </div>
      {network.earnsCommission && <p>Comisión de este mes hasta ahora: <strong>{pesos(network.monthCommission)}</strong></p>}

      <div className="card">
        <h3>Tus referidas directas</h3>
        {referrals.length === 0 ? <p className="muted">Todavía no invitaste a nadie.</p> : (
          <ul className="list">
            {referrals.map((r) => (
              <li key={r.id} className="row between">
                <span>{r.name}</span>
                <span className="row">
                  {r.status !== 'active' && <Badge>{LABELS.user_status[r.status]}</Badge>}
                  <Badge tone={r.active ? 'verde' : 'gris'}>{r.active ? 'Activa' : 'Sin compras recientes'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
