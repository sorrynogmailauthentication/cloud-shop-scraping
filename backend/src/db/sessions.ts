import { randomUUID } from 'node:crypto';
import { getPool } from './index.js';

export interface UserSession {
  id: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function rowToUserSession(row: Record<string, unknown>): UserSession {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    last_seen_at: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    expires_at: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    revoked_at:
      row.revoked_at == null
        ? null
        : row.revoked_at instanceof Date
          ? row.revoked_at.toISOString()
          : String(row.revoked_at),
  };
}

export async function createUserSession(userId: string, ttlMs: number): Promise<UserSession> {
  const p = getPool();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();
  const inserted = await p.query(
    `INSERT INTO user_sessions (id, user_id, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $3, $4)
     RETURNING *`,
    [id, userId, now, expiresAt]
  );
  await revokeExcessSessions(userId, 3);
  return rowToUserSession(inserted.rows[0]);
}

export async function isSessionActive(sessionId: string, userId: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1
     FROM user_sessions
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [sessionId, userId]
  );
  return res.rows.length > 0;
}

export async function touchSession(sessionId: string): Promise<void> {
  await getPool().query(
    `UPDATE user_sessions
     SET last_seen_at = NOW()
     WHERE id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [sessionId]
  );
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  await getPool().query(
    `UPDATE user_sessions
     SET revoked_at = NOW()
     WHERE id = $1
       AND revoked_at IS NULL`,
    [sessionId]
  );
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const res = await getPool().query(
    `UPDATE user_sessions
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
  return res.rowCount ?? 0;
}

export async function revokeExcessSessions(userId: string, maxActive: number): Promise<void> {
  await getPool().query(
    `WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
      FROM user_sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
    )
    UPDATE user_sessions s
    SET revoked_at = NOW()
    FROM ranked r
    WHERE s.id = r.id
      AND r.rn > $2
      AND s.revoked_at IS NULL`,
    [userId, maxActive]
  );
}
