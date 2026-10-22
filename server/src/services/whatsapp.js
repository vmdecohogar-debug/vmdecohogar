import { config } from '../config.js';
import { direct } from '../db/index.js';

// Textos de referencia de cada plantilla. En Meta se cargan y aprueban con estos mismos
// nombres y el mismo orden de variables ({{1}}, {{2}}, ...).
export const TEMPLATES = {
  bienvenida: { vars: ['nombre', 'codigo'], text: 'Hola {{1}}, ya sos parte de la red. Tu código de referida es {{2}}.' },
  pedido_confirmado: { vars: ['pedido', 'total', 'entrega'], text: 'Recibimos tu pedido #{{1}} por {{2}}. Te lo entregamos el {{3}}.' },
  kit_cambios: { vars: ['nombre'], text: 'Hola {{1}}, ¿cómo te fue con tu kit? Entrá a la app si querés cambiar o agregar productos antes de la próxima visita.' },
  recordatorio_vencimiento: { vars: ['nombre', 'monto', 'fecha', 'link'], text: 'Hola {{1}}, te recordamos que el {{3}} vence tu pago de {{2}}. Podés pagar acá: {{4}}' },
  vence_hoy: { vars: ['nombre', 'monto', 'link'], text: 'Hola {{1}}, hoy vence tu pago de {{2}}. Pagá acá: {{3}}' },
  aviso_atraso: { vars: ['nombre', 'monto', 'dias', 'link'], text: 'Hola {{1}}, tu pago de {{2}} tiene {{3}} día(s) de atraso. Regularizalo acá: {{4}}' },
  bloqueo_pedidos: { vars: ['nombre', 'monto', 'recargo', 'link'], text: 'Hola {{1}}, por el atraso el recargo va en {{3}} (sube cada día de atraso) y se pausaron tus pedidos nuevos. Debés {{2}}. Pagá acá: {{4}}' },
  alerta_jefa_mora: { vars: ['jefa', 'vendedora', 'monto', 'dias'], text: 'Hola {{1}}, {{2}} tiene un pago de {{3}} con {{4}} días de atraso. ¿Podés contactarla?' },
  pago_recibido: { vars: ['nombre', 'monto', 'saldo', 'cupo'], text: 'Recibimos tu pago de {{2}}, {{1}}. Saldo pendiente: {{3}}. Cupo disponible: {{4}}.' },
  subida_nivel: { vars: ['nombre', 'nivel'], text: '¡Felicitaciones {{1}}! Subiste a nivel {{2}}.' },
  ascenso_jefa: { vars: ['nombre'], text: '¡Felicitaciones {{1}}! Ya sos jefa zonal: tenés tu panel de red habilitado.' },
  comision_liquidada: { vars: ['nombre', 'periodo', 'monto'], text: 'Hola {{1}}, liquidamos tus comisiones de {{2}}: {{3}}.' },
};

export function render(template, vars) {
  const t = TEMPLATES[template];
  return t.vars.reduce((s, name, i) => s.replaceAll(`{{${i + 1}}}`, String(vars[name] ?? '')), t.text);
}

async function sendViaMeta(phone, template, vars) {
  const { token, phoneNumberId, apiVersion, language } = config.whatsapp;
  const params = TEMPLATES[template].vars.map((name) => ({ type: 'text', text: String(vars[name] ?? '') }));
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'template',
      template: { name: template, language: { code: language }, components: [{ type: 'body', parameters: params }] },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body.messages?.[0]?.id ?? null;
}

// Envía (o simula) un mensaje. dedupeKey evita mandar dos veces el mismo aviso.
export async function sendWhatsApp({ recipientId, phone, template, vars, dedupeKey, optedIn = true }, db = direct) {
  if (!TEMPLATES[template]) throw new Error(`Plantilla desconocida: ${template}`);
  if (dedupeKey) {
    const dup = await db.one('SELECT id FROM messages WHERE dedupe_key = $1', [dedupeKey]);
    if (dup) return { skipped: true };
  }
  let status = 'simulated';
  let providerId = null;
  let error = null;
  if (!optedIn) {
    status = 'skipped';
    error = 'Sin consentimiento de WhatsApp';
  } else if (config.whatsapp.provider === 'meta') {
    try {
      providerId = await sendViaMeta(phone, template, vars);
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = err.message;
    }
  }
  const row = await db.one(
    `INSERT INTO messages (recipient_id, phone, template, vars, status, provider_id, error, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (dedupe_key) DO NOTHING RETURNING *`,
    [recipientId, phone, template, vars, status, providerId, error, dedupeKey ?? null],
  );
  return row ?? { skipped: true };
}

// Atajo: enviar a una usuaria por id.
export async function notifyUser(userId, template, vars, dedupeKey, db = direct) {
  const u = await db.one('SELECT id, phone, whatsapp_opt_in_at FROM users WHERE id = $1', [userId]);
  if (!u) return { skipped: true };
  return sendWhatsApp({ recipientId: u.id, phone: u.phone, template, vars, dedupeKey, optedIn: !!u.whatsapp_opt_in_at }, db);
}
