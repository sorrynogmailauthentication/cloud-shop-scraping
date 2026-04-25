import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
    });
  }
  return pool;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    login VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    avatar_id VARCHAR(255),
    is_paid SMALLINT NOT NULL DEFAULT 0,
    access_until VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
  );
`;

const CREATE_SESSIONS_INDEXES = `
  CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx
  ON user_sessions (user_id, created_at DESC)
  WHERE revoked_at IS NULL;

  CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx
  ON user_sessions (expires_at);
`;

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(CREATE_TABLE);
  await p.query(CREATE_SESSIONS_TABLE);
  await p.query(CREATE_SESSIONS_INDEXES);
  await migrateUserListsKind(p);
}

/** Adds list kind (table vs graph), unique name per user per kind. Safe if user_lists is missing. */
async function migrateUserListsKind(p: pg.Pool): Promise<void> {
  const exists = await p.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user_lists'
    ) AS exists`
  );
  if (!exists.rows[0]?.exists) {
    console.warn('initDb: user_lists missing; skip list kind migration.');
    return;
  }
  try {
    await p.query(`
      ALTER TABLE user_lists
      ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'table'
    `);
    await p.query(`UPDATE user_lists SET kind = 'table' WHERE kind IS NULL OR kind = ''`);
    await p.query(`DROP INDEX IF EXISTS user_lists_user_id_name_lower`);
    await p.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_lists_user_kind_name_lower
      ON user_lists (user_id, kind, (LOWER(TRIM(name))))
    `);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('initDb: user_lists kind migration:', msg);
  }
}
