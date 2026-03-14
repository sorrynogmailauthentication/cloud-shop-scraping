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

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(CREATE_TABLE);
}
