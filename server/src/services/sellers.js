import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { direct, tx } from '../db/index.js';
import { AppError, audit } from './common.js';
import { notifyUser } from './whatsapp.js';

function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) throw new AppError('Teléfono inválido: incluí código de área.');
  return digits.startsWith('54') ? `+${digits}` : `+54${digits}`;
}

async function uniqueCode(name, db) {
  const base = (name.split(' ')[0] || 'RED').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'RED';
  for (;;) {
    const code = `${base}-${randomBytes(2).toString('hex').toUpperCase()}`;
    if (!(await db.one('SELECT 1 FROM sellers WHERE referral_code = $1', [code]))) return code;
  }
}

// Alta de vendedora. Queda pendiente hasta que administración la apruebe.
export async function registerSeller({ name, dni, phone, email, address, password, referralCode, whatsappOptIn }) {
  if (!name?.trim()) throw new AppError('Falta el nombre.');
  if (!password || password.length < 6) throw new AppError('La contraseña debe tener al menos 6 caracteres.');
  if (!dni?.trim()) throw new AppError('Falta el DNI.');
  const tel = normalizePhone(phone);
  return tx(async (db) => {
    if (await db.one('SELECT 1 FROM users WHERE phone = $1 OR dni = $2', [tel, dni.trim()])) {
      throw new AppError('Ya existe una cuenta con ese teléfono o DNI.', 409);
    }
    let referrer = null;
    if (referralCode) {
      referrer = await db.one(
        `SELECT s.user_id, s.zone_id FROM sellers s JOIN users u ON u.id = s.user_id
          WHERE upper(s.referral_code) = upper($1) AND u.status = 'active'`,
        [referralCode.trim()],
      );
      if (!referrer) throw new AppError('El código de referida no existe o no está activo.');
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await db.one(
      `INSERT INTO users (name, dni, phone, email, address, password_hash, role, status, whatsapp_opt_in_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'seller', 'pending', $7) RETURNING id, name, phone, status`,
      [name.trim(), dni.trim(), tel, email ?? null, address ?? null, hash, whatsappOptIn ? new Date() : null],
    );
    const code = await uniqueCode(name, db);
    await db.query('INSERT INTO sellers (user_id, referral_code, referred_by, zone_id) VALUES ($1, $2, $3, $4)', [
      user.id, code, referrer?.user_id ?? null, referrer?.zone_id ?? null,
    ]);
    await audit(db, user.id, 'register', 'seller', user.id, { referralCode });
    return { ...user, referralCode: code };
  });
}

export async function approveSeller(sellerId, adminId, zoneId) {
  return tx(async (db) => {
    const u = await db.one(`UPDATE users SET status = 'active' WHERE id = $1 AND role = 'seller' RETURNING id, name`, [sellerId]);
    if (!u) throw new AppError('Vendedora no encontrada', 404);
    if (zoneId) await db.query('UPDATE sellers SET zone_id = $2 WHERE user_id = $1', [sellerId, zoneId]);
    const s = await db.one('SELECT referral_code FROM sellers WHERE user_id = $1', [sellerId]);
    await audit(db, adminId, 'approve', 'seller', sellerId);
    await notifyUser(sellerId, 'bienvenida', { nombre: u.name, codigo: s.referral_code }, `welcome:${sellerId}`, db);
    return u;
  });
}

export async function setSellerStatus(sellerId, status, adminId) {
  if (!['active', 'blocked', 'inactive'].includes(status)) throw new AppError('Estado inválido');
  await direct.query(`UPDATE users SET status = $2 WHERE id = $1 AND role = 'seller'`, [sellerId, status]);
  await audit(direct, adminId, 'status', 'seller', sellerId, { status });
}

// Cambio manual de nivel o cupo (excepciones), siempre con motivo.
export async function overrideSeller(sellerId, { levelCode, creditLimitOverride, reason }, adminId) {
  if (!reason?.trim()) throw new AppError('Indicá el motivo del cambio.');
  return tx(async (db) => {
    const before = await db.one('SELECT level_code, credit_limit_override FROM sellers WHERE user_id = $1', [sellerId]);
    if (!before) throw new AppError('Vendedora no encontrada', 404);
    if (levelCode) await db.query('UPDATE sellers SET level_code = $2 WHERE user_id = $1', [sellerId, levelCode]);
    if (creditLimitOverride !== undefined) {
      await db.query('UPDATE sellers SET credit_limit_override = $2 WHERE user_id = $1', [sellerId, creditLimitOverride]);
    }
    await audit(db, adminId, 'override', 'seller', sellerId, { before, levelCode, creditLimitOverride, reason });
  });
}

export async function login(phone, password) {
  let tel;
  try {
    tel = normalizePhone(phone);
  } catch {
    throw new AppError('Teléfono o contraseña incorrectos.', 401);
  }
  const u = await direct.one('SELECT * FROM users WHERE phone = $1', [tel]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new AppError('Teléfono o contraseña incorrectos.', 401);
  if (u.status === 'inactive') throw new AppError('La cuenta está dada de baja.', 403);
  return u;
}

export { normalizePhone };
