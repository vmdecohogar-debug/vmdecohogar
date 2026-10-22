import { fecha } from '../../format.js';
import { Badge, Loading, useApi } from '../../components/ui.jsx';

const TYPES = { mora: 'Mora (aviso a jefa)', mora_admin: 'Mora de 7 días o más', level_down: 'Bajó de nivel', level_reset: 'Volvió a Inicial (30 días)' };
const MSG_TONE = { sent: 'verde', simulated: 'gris', failed: 'rojo', skipped: 'amarillo' };
const MSG_LABEL = { sent: 'Enviado', simulated: 'Simulado', failed: 'Falló', skipped: 'Sin permiso' };

export default function AdminAlerts() {
  const alerts = useApi('/admin/alerts');
  const messages = useApi('/admin/messages');

  return (
    <div>
      <h1>Alertas y mensajes</h1>
      <div className="card">
        <h3>Alertas abiertas</h3>
        {!alerts.data ? <Loading error={alerts.error} /> : alerts.data.length === 0 ? <p className="muted">Sin alertas.</p> : (
          <ul className="list">
            {alerts.data.map((a) => (
              <li key={a.id} className="row between">
                <div>
                  <strong>{a.seller_name}</strong> · {TYPES[a.type] ?? a.type}
                  <div className="muted small">{a.note} · {fecha(a.created_at)}{a.recipient_name ? ` · avisada ${a.recipient_name}` : ''}</div>
                </div>
                <Badge tone={a.status === 'handled' ? 'verde' : 'amarillo'}>{a.status === 'handled' ? 'Gestionada' : 'Abierta'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h3>WhatsApp enviados</h3>
        <p className="muted small">“Simulado” significa que el mensaje se generó pero no salió porque todavía no está conectada la API oficial de WhatsApp.</p>
        {!messages.data ? <Loading error={messages.error} /> : messages.data.length === 0 ? <p className="muted">Todavía no hay mensajes.</p> : (
          <ul className="list">
            {messages.data.map((m) => (
              <li key={m.id}>
                <div className="row between"><strong>{m.recipient_name ?? m.phone}</strong><Badge tone={MSG_TONE[m.status]}>{MSG_LABEL[m.status]}</Badge></div>
                <div className="small">{m.text}</div>
                <div className="muted small">{m.template} · {fecha(m.created_at)}{m.error ? ` · ${m.error}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
