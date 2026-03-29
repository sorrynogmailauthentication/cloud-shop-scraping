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

/** Unique table name per user (case-insensitive, trimmed). Requires `user_lists` to exist. */
const USER_LISTS_UNIQUE_NAME_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS user_lists_user_id_name_lower
  ON user_lists (user_id, (LOWER(TRIM(name))));
`;

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

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(CREATE_TABLE);
  try {
    await p.query(USER_LISTS_UNIQUE_NAME_INDEX);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('does not exist') && msg.includes('user_lists')) {
      console.warn(
        'initDb: user_lists table missing; skip unique name index. Apply migrations when schema exists.'
      );
      return;
    }
    throw e;
  }
}
