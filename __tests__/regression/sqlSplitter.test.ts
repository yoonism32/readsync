/**
 * Regression test for the migration runner's naive `sql.split(';')`, which
 * crashed a real deploy (2026-08-04, a DO block) and broke migration 011
 * (a semicolon inside its own header comment) — the exact class ROADMAP.md
 * flagged as "any DO block, function body, or semicolon inside a comment
 * breaks it." The previous ad-hoc split-simulation script is folded in here.
 */
import { describe, it, expect } from 'vitest';
import { splitSqlStatements } from '../../src/db/sqlSplitter.js';

describe('splitSqlStatements', () => {
  it('splits ordinary statements on top-level semicolons', () => {
    const sql = 'CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);';
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE a (id INT);',
      'CREATE TABLE b (id INT);',
    ]);
  });

  it('ignores a semicolon inside a line comment (the migration 011 bug)', () => {
    const sql = `-- steps; rating*2 = round(rating*2) rejects anything off-grid.
ALTER TABLE t ADD CONSTRAINT c CHECK (true);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('ALTER TABLE t ADD CONSTRAINT c');
  });

  it('ignores a semicolon inside a block comment', () => {
    const sql = '/* first; second */ CREATE TABLE a (id INT);';
    expect(splitSqlStatements(sql)).toHaveLength(1);
  });

  it('ignores a semicolon inside a dollar-quoted DO block (the 2026-08-04 bug)', () => {
    const sql = `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1) THEN
    NULL;
  END IF;
END
$$;
CREATE TABLE after_block (id INT);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('DO $$');
    expect(statements[1]).toContain('CREATE TABLE after_block');
  });

  it('ignores a semicolon inside a tagged dollar-quoted function body', () => {
    const sql = `CREATE FUNCTION f() RETURNS void AS $body$
BEGIN
  PERFORM 1;
END;
$body$ LANGUAGE plpgsql;
CREATE TABLE after_fn (id INT);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[1]).toContain('CREATE TABLE after_fn');
  });

  it('ignores a semicolon inside a single-quoted string literal', () => {
    const sql = "INSERT INTO t (note) VALUES ('a; b');\nCREATE TABLE u (id INT);";
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'a; b'");
  });

  it('handles CONCURRENTLY statements like any other', () => {
    const sql = 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON t (a);';
    const statements = splitSqlStatements(sql);
    expect(statements).toEqual([sql]);
  });
});
