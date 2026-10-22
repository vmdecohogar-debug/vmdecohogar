import { Link } from 'react-router-dom';
import { fecha, pesos } from '../../format.js';
import { Loading, Semaphore, Stat, useApi } from '../../components/ui.jsx';

export default function SellerHome() {
  const { data, error } = useApi('/seller/dashboard');
  if (!data) return <Loading error={error} />;
  const { profile, level, nextLevel, credit, pending, network, needsKit, kit, blocked, balanceCredit } = data;
  const next = pending.find((p) => p.due_date);
  const usedPct = credit.limit ? Math.min(100, Math.round((credit.used / credit.limit) * 100)) : 0;

  return (
    <div>
      <div className="row between">
        <h1>Hola, {profile.name.split(' ')[0]}</h1>
        <button type="button" className="btn secondary small" onClick={() => window.dispatchEvent(new Event('open-guide'))}>Cómo funciona</button>
      </div>
      {profile.status === 'pending' && <div className="notice warn">Tu cuenta está pendiente de aprobación. Te avisamos por WhatsApp.</div>}
      {blocked && <div className="notice error">Tenés un pago atrasado y los pedidos nuevos están pausados. <Link to="/pagos">Regularizalo acá</Link>.</div>}

      {needsKit && profile.status === 'active' && (
        <div className="card tint stack">
          <h2>Tu kit de arranque</h2>
          {!kit && <p>Elegí hasta {data.kitRules.maxUnits} productos o hasta {pesos(data.kitRules.maxAmount)}. Te lo dejamos sin cargo y pagás solo lo que te quedás en la segunda visita.</p>}
          {kit?.status === 'confirmed' && <p>Tu kit llega el {fecha(kit.delivery_date)}.</p>}
          {kit?.status === 'delivered' && <p>Ya tenés tu kit. Antes de la segunda visita podés pedir cambios o agregar productos.</p>}
          {!kit && <Link className="btn" to="/comprar" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>Armar mi kit</Link>}
          {kit?.status === 'delivered' && <Link className="btn" to="/pedidos" style={{ textDecoration: 'none' }}>Pedir cambios</Link>}
        </div>
      )}

      <div className="grid four" style={{ marginBottom: 16 }}>
        <Stat label="Cupo disponible" value={pesos(credit.available)} hint={`de ${pesos(credit.limit)}`} />
        <Stat label="Debés" value={pesos(pending.reduce((s, p) => s + p.balance, 0))} hint={next ? `vence ${fecha(next.due_date)}` : 'sin vencimientos'} />
        <Stat label="Nivel" value={level.name} hint={level.termDays ? `${level.termDays} días para pagar` : 'contra entrega'} />
        <Stat label="Saldo a favor" value={pesos(balanceCredit)} hint="se descuenta en tu próximo pedido" />
      </div>

      {credit.limit > 0 && (
        <div className="card">
          <div className="row between"><strong>Uso de tu cupo</strong><span className="muted">{usedPct}%</span></div>
          <div className="bar"><span style={{ width: `${usedPct}%` }} /></div>
          {level.discountPct > 0 && <p className="muted small">Si pagás antes de recibir el pedido tenés {level.discountPct}% de descuento.</p>}
        </div>
      )}

      {nextLevel && nextLevel.requiredCleanOrders > 0 && (
        <div className="card">
          <strong>Próximo nivel: {nextLevel.name}</strong>
          <div className="bar"><span style={{ width: `${Math.min(100, (nextLevel.currentStreak / nextLevel.requiredCleanOrders) * 100)}%` }} /></div>
          <p className="muted small">{nextLevel.currentStreak} de {nextLevel.requiredCleanOrders} pedidos pagados a tiempo seguidos.</p>
        </div>
      )}

      <div className="card">
        <div className="row between"><h3 style={{ margin: 0 }}>Pagos pendientes</h3><Link to="/pagos">Ver todos</Link></div>
        {pending.length === 0 ? <p className="muted">No tenés pagos pendientes.</p> : (
          <ul className="list">
            {pending.slice(0, 4).map((p) => (
              <li key={p.id} className="row between">
                <div>
                  <strong>{pesos(p.balance)}</strong>
                  <div className="muted small">Pedido #{p.order_id} · {p.due_date ? `vence ${fecha(p.due_date)}` : 'vence al entregar'}</div>
                </div>
                <div className="row"><Semaphore value={p.semaphore} /><Link className="btn small" to={`/pagar/${p.id}`} style={{ textDecoration: 'none' }}>Pagar</Link></div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="row between"><h3 style={{ margin: 0 }}>Tu red</h3><Link to="/referidas">Invitar</Link></div>
        <p className="muted">
          {network.activeDirect} referidas activas.{' '}
          {network.earnsCommission ? `Este mes llevás ${pesos(network.monthCommission)} de comisión.` : `Te faltan ${network.missingToEarn} para empezar a cobrar comisión.`}
        </p>
      </div>
    </div>
  );
}
