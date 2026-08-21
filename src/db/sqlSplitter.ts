/**
 * Splits a SQL file into individual statements on top-level semicolons —
 * "top-level" meaning outside line comments, block comments, quoted
 * strings/identifiers, and dollar-quoted bodies ($$...$$ / $tag$...$tag$,
 * used by DO blocks and function bodies). A naive `sql.split(';')` breaks
 * on any of those, which crashed a real deploy (2026-08-04) and broke
 * migration 011 (a semicolon inside its own header comment).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    // Line comment: -- until end of line (inclusive, so it isn't rescanned).
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? n : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment: /* ... */, not nested (Postgres doesn't nest these either).
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-quoted string literal, '' is an escaped quote.
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Double-quoted identifier, "" is an escaped quote.
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted body: $$...$$ or $tag$...$tag$ (DO blocks, function bodies).
    if (ch === '$') {
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const opener = tagMatch[0];
        const closerIndex = sql.indexOf(opener, i + opener.length);
        const stop = closerIndex === -1 ? n : closerIndex + opener.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ';') {
      current += ch;
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const trailing = current.trim();
  if (trailing)
    statements.push(trailing.endsWith(';') ? trailing : `${trailing};`);

  return statements;
}
