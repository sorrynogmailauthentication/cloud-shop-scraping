import { getPool } from './index.js';
import type { YandexUserInfo } from '../types/auth.js';

export interface DbUser {
  id: string;
  email: string | null;
  login: string;
  display_name: string | null;
  avatar_id: string | null;
  is_paid: number;
  access_until: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDbUser(row: Record<string, unknown>): DbUser {
  return {
    id: String(row.id),
    email: row.email != null ? String(row.email) : null,
    login: String(row.login),
    display_name: row.display_name != null ? String(row.display_name) : null,
    avatar_id: row.avatar_id != null ? String(row.avatar_id) : null,
    is_paid: Number(row.is_paid),
    access_until: row.access_until != null ? String(row.access_until) : null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function upsertUser(profile: YandexUserInfo): Promise<DbUser> {
  const p = getPool();
  const now = new Date();
  const displayName = profile.display_name || profile.real_name || profile.login || null;
  const email = profile.default_email ?? null;
  const avatarId = profile.default_avatar_id ?? null;

  const existing = await p.query('SELECT id FROM users WHERE id = $1', [profile.id]);

  if (existing.rows.length > 0) {
    await p.query(
      `UPDATE users SET email = $1, login = $2, display_name = $3, avatar_id = $4, updated_at = $5 WHERE id = $6`,
      [email, profile.login, displayName, avatarId, now, profile.id]
    );
  } else {
    await p.query(
      `INSERT INTO users (id, email, login, display_name, avatar_id, is_paid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $6)`,
      [profile.id, email, profile.login, displayName, avatarId, now]
    );
  }

  const user = await getUserById(profile.id);
  return user!;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const res = await getPool().query('SELECT * FROM users WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  return rowToDbUser(res.rows[0]);
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const res = await getPool().query('SELECT * FROM users WHERE email = $1', [email]);
  if (res.rows.length === 0) return null;
  return rowToDbUser(res.rows[0]);
}

export async function setUserPaid(id: string, isPaid: boolean): Promise<DbUser | null> {
  const p = getPool();
  const res = await p.query('UPDATE users SET is_paid = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [
    isPaid ? 1 : 0,
    id,
  ]);
  if (res.rowCount === 0) return null;
  return rowToDbUser(res.rows[0]);
}

export async function setUserAccessUntil(id: string, accessUntil: string | null): Promise<DbUser | null> {
  const p = getPool();
  const res = await p.query('UPDATE users SET access_until = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [
    accessUntil,
    id,
  ]);
  if (res.rowCount === 0) return null;
  return rowToDbUser(res.rows[0]);
}
