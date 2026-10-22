import pg from 'pg';
import { config } from '../config.js';

// bigint (int8) como número: los montos en centavos entran holgados en un Number.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric como número (porcentajes)
pg.types.setTypeParser(1700, (v) => Number(v));
// date como 'YYYY-MM-DD', sin convertir a hora local
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

// Ejecuta fn dentro de una transacción. fn recibe un cliente con la misma interfaz que query/one.
export async function tx(fn) {
  const client = await pool.connect();
  const db = {
    query: (t, p) => client.query(t, p),
    one: async (t, p) => (await client.query(t, p)).rows[0] ?? null,
  };
  try {
    await client.query('BEGIN');
    const result = await fn(db);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const direct = { query, one };
