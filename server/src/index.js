import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { runDaily } from './services/daily.js';
import { injectMeta, pageMeta } from './services/seo.js';

await migrate();
const app = createApp();
// En producción, la misma API sirve el frontend compilado (web/dist).
const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(dist)) {
  const template = readFileSync(`${dist}/index.html`, 'utf8');
  // Cada página sale con su título, descripción y datos para Google ya completos (SEO).
  const page = async (req, res) => {
    try {
      res.type('html').send(injectMeta(template, await pageMeta(req.path)));
    } catch (err) {
      console.error('seo', err);
      res.type('html').send(template);
    }
  };
  app.get('/', page);
  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api|\/uploads).*/, page);
}
app.listen(config.port, () => console.log(`API en http://localhost:${config.port}`));

// Proceso diario a las 10:00 (dentro del horario de envío de WhatsApp).
if (process.env.DAILY_JOB !== 'off') {
  let lastRun = null;
  setInterval(async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() >= 10 && lastRun !== day) {
      lastRun = day;
      try {
        console.log('proceso diario', await runDaily());
      } catch (err) {
        console.error('proceso diario falló', err);
      }
    }
  }, 60_000);
}
