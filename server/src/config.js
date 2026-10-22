export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/redvendedora',
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
