import { fileURLToPath } from 'node:url';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/redvendedora',
  // Carpeta donde se guardan las fotos de productos (en producción, un disco persistente).
  uploadsDir: process.env.UPLOADS_DIR || fileURLToPath(new URL('../uploads', import.meta.url)),
  jwtSecret: process.env.JWT_SECRET ?? 'cambiar-en-produccion',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  // Fecha "de hoy" fija para pruebas; vacío = fecha real.
  today: process.env.TODAY_OVERRIDE || null,
  whatsapp: {
    // 'simulated' guarda el mensaje sin enviarlo; 'meta' usa la Cloud API oficial.
    provider: process.env.WHATSAPP_PROVIDER ?? 'simulated',
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
    language: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR',
  },
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN,
  },
};

export function today() {
  return config.today ?? new Date().toISOString().slice(0, 10);
}

// Momento actual; en pruebas, el mediodía del día simulado.
export function now() {
  return config.today ? new Date(`${config.today}T12:00:00Z`) : new Date();
}
