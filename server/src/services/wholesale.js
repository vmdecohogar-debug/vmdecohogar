// Clientes mayoristas: se registran solos (quedan pendientes) o con el enlace de invitación (quedan habilitados),
// o los da de alta administración. Solo las cuentas activas ven el precio mayorista.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { direct, tx } from '../db/index.js';
import { AppError, audit, getSettings } from './common.js';
import { normalizePhone } from './sellers.js';

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export async function wholesaleSettings() {
  return (await getSettings()).wholesale ?? { inviteCode: null, requireApproval: true };
}

export async function register(data, { byAdmin = null } = {}) {
  const name = str(data.name, 120);
  if (!name) throw new AppError('Falta el nombre.');
  if (!byAdmin && (!data.password || data.password.length < 6)) throw new AppError('La contraseña debe tener al menos 6 caracteres.');
  const password = data.password || randomBytes(4).toString('hex');
  const phone = normalizePhone(data.phone);
  const ws = await wholesaleSettings();
  const invited = !!data.invite && !!ws.inviteCode && data.invite === ws.inviteCode;
  const status = byAdmin || invited || ws.requireApproval === false ? 'active' : 'pending';
  return tx(async (db) => {
    if (await db.one('SELECT 1 FROM users WHERE phone = $1', [phone])) throw new AppError('Ya hay una cuenta con ese teléfono. Probá ingresar.', 409);
    const u = await db.one(
      `INSERT INTO users (name, phone, email, address, city, business, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'wholesale', $8) RETURNING id, name, phone, role, status`,
      [name, phone, str(data.email, 120) || null, str(data.address, 250) || null, str(data.city, 120) || null,
        str(data.business, 120) || null, await bcrypt.hash(password, 10), status],
    );
    await audit(db, byAdmin ?? u.id, 'register', 'wholesale', u.id, { invited, byAdmin: !!byAdmin });
    return { ...u, ...(byAdmin && !data.password ? { tempPassword: password } : {}) };
  });
}

export async function list() {
  return (await direct.query(
    `SELECT u.id, u.name, u.business, u.phone, u.email, u.address, u.city, u.status, u.created_at,
            (SELECT COUNT(*)::int FROM web_orders o WHERE o.user_id = u.id AND o.status <> 'cancelled') AS orders
       FROM users u WHERE u.role = 'wholesale' ORDER BY u.status = 'pending' DESC, u.created_at DESC`,
  )).rows;
}

export async function setStatus(id, status, adminId) {
  if (!['active', 'blocked'].includes(status)) throw new AppError('Estado inválido.');
  const u = await direct.one(`UPDATE users SET status = $2 WHERE id = $1 AND role = 'wholesale' RETURNING id, status`, [id, status]);
  if (!u) throw new AppError('Cliente no encontrado', 404);
  await audit(direct, adminId, 'status', 'wholesale', id, { status });
  return u;
}

// Nuevo enlace de invitación (el anterior deja de funcionar).
export async function newInvite(adminId, requireApproval) {
  const ws = await wholesaleSettings();
  const next = { ...ws, inviteCode: randomBytes(6).toString('base64url'), requireApproval: requireApproval ?? ws.requireApproval ?? true };
  await direct.query(`INSERT INTO settings (key, value) VALUES ('wholesale', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [next]);
  await audit(direct, adminId, 'invite', 'wholesale', null);
  return next;
}

export async function setRequireApproval(requireApproval, adminId) {
  const next = { ...(await wholesaleSettings()), requireApproval: !!requireApproval };
  await direct.query(`INSERT INTO settings (key, value) VALUES ('wholesale', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [next]);
  await audit(direct, adminId, 'update', 'settings', null, { key: 'wholesale' });
  return next;
}
