import { pool } from '../db/index.js';
import { runDaily } from '../services/daily.js';

// Para correr el proceso diario desde un cron externo: npm run daily
runDaily().then((r) => { console.log(r); return pool.end(); }, (err) => { console.error(err); process.exit(1); });
