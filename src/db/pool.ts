import { URL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import {
  DATABASE_URL,
  PG_CONN_TIMEOUT_MS,
  PG_IDLE_TIMEOUT_MS,
  PG_POOL_MAX,
  PG_STATEMENT_TIMEOUT_MS,
} from '../config.js';
import logger from '../logger.js';

function forceNoVerify(dbUrl: string): string {
  try {
    const u = new URL(dbUrl);
    u.searchParams.set('sslmode', 'no-verify');
    return u.toString();
  } catch {
    if (/sslmode=/.test(dbUrl)) {
      return dbUrl.replace(/sslmode=[^&]+/i, 'sslmode=no-verify');
    }
    return `${dbUrl + (dbUrl.includes('?') ? '&' : '?')}sslmode=no-verify`;
  }
}

const pool = new Pool({
  connectionString: forceNoVerify(DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  max: PG_POOL_MAX,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: PG_CONN_TIMEOUT_MS,
  keepAlive: true,
  statement_timeout: PG_STATEMENT_TIMEOUT_MS,
  query_timeout: PG_STATEMENT_TIMEOUT_MS,
});

pool.on('error', (err) => logger.error({ err }, 'PostgreSQL pool error'));
pool.on('connect', () => logger.debug('New PostgreSQL connection established'));

export default pool;

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
