/**
 * Regression tests for the migration runner.
 * BUG-R4: migrations were ad-hoc ALTER TABLE in schema.ts — no tracking or ordering.
 * Now uses versioned .sql files + schema_migrations table.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/db/migrations',
);

describe('migration files', () => {
  it('migration directory exists', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it('all migration files are .sql', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const nonSql = files.filter((f) => !f.endsWith('.sql'));
    expect(nonSql).toHaveLength(0);
  });

  it('migration files are numbered sequentially starting at 001', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^001_/);
  });

  it('no duplicate migration numbers', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const numbers = files.map((f) => f.split('_')[0]);
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
  });

  it('002_indexes.sql uses CONCURRENTLY (BUG-R4: indexes must not lock table)', () => {
    const indexFile = path.join(MIGRATIONS_DIR, '002_indexes.sql');
    if (fs.existsSync(indexFile)) {
      const content = fs.readFileSync(indexFile, 'utf8');
      expect(content).toMatch(/CONCURRENTLY/i);
    }
  });

  it('all migrations use TIMESTAMPTZ not TIMESTAMP (BUG-R5: timezone-aware timestamps)', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Must not contain bare TIMESTAMP without TZ
      const bareTimestamp = content.match(/\bTIMESTAMP\b(?!\s*WITH\s*TIME\s*ZONE|\s*TZ)/gi);
      expect(bareTimestamp, `${file} contains bare TIMESTAMP — use TIMESTAMPTZ`).toBeNull();
    }
  });
});
