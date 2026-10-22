import { useState } from 'react';
import { api } from '../api.js';
import { pesos } from '../format.js';
import { useApi } from './ui.jsx';

// Pasos cortos: una idea por pantalla. Los números salen de la configuración vigente.
function steps({ levels, kit, commissions, mora, delivery }) {
  const paid = levels.filter((l) => l.credit_limit > 0);
  const discount = paid[0]?.early_discount_pct ?? 0;
  return [
    {
      icon: '🌿',
      title: '¡Bienvenida a la red!',
      body: (
        <>
          <p>Vas a vender productos de VM Bazar y Deco con tu propio precio sugerido y tu ganancia.</p>
          <p>Te contamos en 5 pasos cómo funciona. Lo podés volver a ver cuando quieras desde Inicio.</p>
        </>
      ),
    },
    {
      icon: '🧺',
      title: 'Arrancás con un kit',
      body: (
        <>
          <p>Elegís hasta <strong>{kit.maxUnits} productos</strong> o <strong>{pesos(kit.maxAmount)}</strong> y te los dejamos en consignación: no pagás nada por adelantado.</p>
          <p>A los {kit.followUpDays} días te escribimos: desde <strong>Pedidos</strong> marcás qué devolvés y qué querés sumar. En la segunda visita te llevamos lo nuevo y pagás solo lo que te quedás.</p>
        </>
      ),
    },
    {
      icon: '⭐',
      title: 'Subís de nivel pagando a tiempo',
      body: (
        <>
          <p>Con tu primer pago pasás a Bronce y podés pedir a crédito:</p>
          <ul className="onb-levels">
            {paid.map((l) => (
              <li key={l.code}><strong>{l.name}</strong><span>hasta {pesos(l.credit_limit)} · {l.term_days} días para pagar</span></li>
            ))}
          </ul>
          {discount > 0 && <p>Si pagás antes de recibir el pedido, tenés <strong>{discount}% de descuento</strong>.</p>}
          <p className="muted small">Pedís cuando quieras y te llega en {delivery.minBusinessDays} a {delivery.maxBusinessDays} días hábiles.</p>
        </>
      ),
    },
    {
      icon: '📅',
      title: 'Pagos y vencimientos',
      body: (
        <>
          <p>Pagás en efectivo o con Mercado Pago, desde <strong>Pagos</strong>. Te avisamos por WhatsApp {mora.reminderDaysBefore} días antes de cada vencimiento.</p>
          <p>Si te atrasás {mora.surchargeDay} días o más, se suma un recargo del {mora.surchargePct}% y no podés hacer pedidos nuevos hasta ponerte al día. También le avisamos a tu jefa zonal para que te ayude.</p>
          <p className="muted small">Pagar a tiempo es lo que te hace subir de nivel y tener más cupo.</p>
        </>
      ),
    },
    {
      icon: '🤝',
      title: 'Sumá referidas y ganá más',
      body: (
        <>
          <p>Compartí tu código desde <strong>Referidas</strong>. Cuando tengas <strong>{commissions.minActiveToEarn} referidas activas</strong>, cobrás el {commissions.tier1Pct}% de lo que ellas pagan y el {commissions.tier2Pct}% de lo que pagan sus referidas.</p>
          <p>Con <strong>{commissions.minActiveForLeader} activas</strong> te convertís en jefa zonal: tenés tu panel para acompañar a tu red y podés ser punto de entrega.</p>
        </>
      ),
    },
  ];
}

export function Onboarding({ onClose, finishTo }) {
  const { data } = useApi('/onboarding');
  const [i, setI] = useState(0);
  if (!data) return null;
  const list = steps(data);
  const step = list[i];
  const last = i === list.length - 1;
  const close = (to) => api('/me/onboarded', { method: 'POST' }).catch(() => {}).finally(() => onClose(to));

  return (
    <div className="onb-backdrop" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb card">
        <button type="button" className="onb-skip" onClick={() => close()}>Saltar</button>
        <div className="onb-icon" aria-hidden="true">{step.icon}</div>
        <h2 id="onb-title">{step.title}</h2>
        <div className="onb-body">{step.body}</div>
        <div className="onb-dots" aria-label={`Paso ${i + 1} de ${list.length}`}>
          {list.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
        </div>
        <div className="row">
          {i > 0 && <button type="button" className="btn secondary" onClick={() => setI(i - 1)}>Atrás</button>}
          {last
            ? <button type="button" className="btn" onClick={() => close(finishTo)}>{finishTo ? 'Armar mi kit' : 'Listo'}</button>
            : <button type="button" className="btn" onClick={() => setI(i + 1)}>Siguiente</button>}
        </div>
      </div>
    </div>
  );
}
