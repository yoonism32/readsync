/**
 * Minimal SQL migration runner.
 *
 * - Tracks applied migrations in `schema_migrations` table.
 * - Runs each `.sql` file in `src/db/migrations/` in filename order.
 * - Statements containing CONCURRENTLY are run outside transactions
 *   (Postgres requirement).
 * - Migrations are immutable once applied — never edit a deployed file,
 *   create a new numbered one instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import logger from '../logger.js';
import pool from './pool.js';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  );
  return new Set(result.rows.map((r) => r.name));
}

async function runStatementsConcurrently(statements: string[]): Promise<void> {
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    // CONCURRENTLY cannot run inside a transaction — use pool directly
    await pool.query(trimmed);
  }
}

async function runStatementsInTransaction(statements: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) await client.query(trimmed);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getApplied();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic — 001 < 002 < 003...

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${s};`);

    const hasConcurrent = statements.some((s) => /CONCURRENTLY/i.test(s));

    logger.info({ migration: file }, 'Applying migration');

    if (hasConcurrent) {
      await runStatementsConcurrently(statements);
    } else {
      await runStatementsInTransaction(statements);
    }

    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
      file,
    ]);
    logger.info({ migration: file }, 'Migration applied');
  }
}
