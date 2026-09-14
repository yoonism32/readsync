import { createHash } from 'node:crypto';
import { withTransaction } from '../db/pool.js';

type Row = Record<string, unknown>;
const specs = [
  [
    'novels',
    'novels',
    'id title primary_url author genre description latest_chapter_num latest_chapter_title chapters_updated_at site_latest_chapter_time_raw site_latest_chapter_time cover_img created_at synopsis synopsis_imported_at',
  ],
  [
    'devices',
    'devices',
    'id user_id device_label device_type user_agent last_seen active created_at',
  ],
  [
    'meta',
    'user_novel_meta',
    'user_id novel_id status favorite rating notes started_at completed_at updated_at current_read_through read_history created_at progress_reset_at last_read_at',
  ],
  [
    'progress',
    'progress_snapshots',
    'user_id device_id novel_id chapter_token chapter_num chapter_slug_extra percent url seconds_on_page read_through_num created_at import_key',
  ],
  [
    'bookmarks',
    'bookmarks',
    'user_id novel_id chapter_url percent bookmark_type title note created_at import_key',
  ],
  [
    'notes',
    'novel_notes',
    'user_id novel_id note_text chapter_num created_at updated_at import_key',
  ],
  ['categories', 'novel_categories', 'user_id novel_id category created_at'],
  [
    'sessions',
    'reading_sessions',
    'user_id novel_id device_id session_type start_time end_time start_percent end_percent time_spent_seconds created_at import_key',
  ],
  ['settings', 'user_settings', 'user_id key value updated_at'],
  [
    'notifications',
    'notifications',
    'user_id novel_id type message read created_at import_key',
  ],
] as const;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateImport(
  data: unknown,
): asserts data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Expected an export object');
  const input = data as Record<string, unknown>;
  if (input.version !== undefined && input.version !== 2)
    throw new Error('Unsupported export version');
  if (!Array.isArray(input.novels))
    throw new Error('Export must contain novels');
  for (const [key] of specs) {
    const rows = input[key];
    if (rows === undefined && input.version !== 2) continue;
    if (!Array.isArray(rows) || rows.length > 500000)
      throw new Error(`Invalid ${key} collection`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row))
        throw new Error(`Invalid ${key} record`);
      for (const field of ['url', 'primary_url', 'chapter_url', 'cover_img']) {
        const value = row[field];
        if (value == null || (value === 'failed' && field === 'cover_img'))
          continue;
        if (typeof value !== 'string' || value.length > 4096)
          throw new Error('Invalid URL');
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('Only HTTPS URLs without credentials are allowed');
      }
    }
  }
}

/** Merge a versioned export atomically. Never restore credentials or foreign user IDs. */
export async function restoreExport(
  data: Record<string, unknown>,
  userId: string,
) {
  validateImport(data);
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `import:${userId}`,
    ]);
    const now =
      typeof data.export_date === 'string'
        ? data.export_date
        : new Date().toISOString();
    const sourceUser = String(data.user_id ?? 'legacy');
    const deviceId = (id: unknown) =>
      sourceUser === userId && typeof id === 'string'
        ? id
        : `import:${digest(`${userId}:${sourceUser}:${String(id ?? 'unknown')}`)}`;
    const input = { ...data };
    if (data.version !== 2) {
      input.meta = (data.novels as Row[]).map((n) => ({
        ...n,
        novel_id: n.id,
        status: n.status ?? 'reading',
      }));
      const ids = new Set(
        ((data.progress ?? []) as Row[]).map((p) => p.device_id),
      );
      input.devices = [...ids].map((id) => ({
        id,
        device_label: 'Imported device',
        device_type: 'unknown',
        active: false,
      }));
    }
    const imported: Record<string, number> = {};
    for (const [key, table, columnString] of specs) {
      const columns = columnString.split(' ');
      const rows = ((input[key] ?? []) as Row[]).map((raw) => {
        const row: Row = {
          created_at: now,
          updated_at: now,
          ...raw,
          user_id: userId,
        };
        if (key === 'devices') {
          row.id = deviceId(raw.id);
          row.active ??= false;
        }
        if (columns.includes('device_id'))
          row.device_id = deviceId(raw.device_id);
        if (columns.includes('import_key'))
          row.import_key =
            raw.import_key ??
            digest(`${sourceUser}:${table}:${raw.id ?? JSON.stringify(raw)}`);
        if (key === 'meta') {
          row.status ??= 'reading';
          row.favorite ??= false;
          row.current_read_through ??= 1;
          row.read_history ??= [];
        }
        if (key === 'progress') {
          row.read_through_num ??= 1;
          row.seconds_on_page ??= 0;
        }
        if (key === 'bookmarks') row.bookmark_type ??= 'position';
        return Object.fromEntries(
          columns.map((column) => [column, row[column] ?? null]),
        );
      });
      imported[key] = 0;
      for (let offset = 0; offset < rows.length; offset += 500) {
        // All SQL identifiers come from the static allowlist above, never the file.
        const conflict =
          key === 'meta'
            ? `ON CONFLICT (user_id, novel_id) DO UPDATE SET ${columns
                .filter((c) => !['user_id', 'novel_id'].includes(c))
                .map((c) => `${c} = EXCLUDED.${c}`)
                .join(', ')}`
            : key === 'settings'
              ? 'ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at'
              : 'ON CONFLICT DO NOTHING';
        const result = await client.query(
          `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${columns.map((c) => `x.${c}`).join(', ')} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb) x
           ${
             ['progress', 'notes', 'sessions', 'notifications'].includes(key)
               ? `WHERE NOT EXISTS (
             SELECT 1 FROM ${table} existing WHERE existing.user_id = $2 AND existing.novel_id = x.novel_id
             AND existing.created_at IS NOT DISTINCT FROM x.created_at
             AND ${key === 'progress' ? 'existing.chapter_num IS NOT DISTINCT FROM x.chapter_num AND existing.percent = x.percent AND existing.read_through_num = x.read_through_num' : key === 'notes' ? 'existing.note_text = x.note_text AND existing.chapter_num IS NOT DISTINCT FROM x.chapter_num' : key === 'sessions' ? 'existing.start_time = x.start_time AND existing.end_time IS NOT DISTINCT FROM x.end_time' : 'existing.type = x.type AND existing.message = x.message'}
           )`
               : ''
           } ${conflict}`,
          ['progress', 'notes', 'sessions', 'notifications'].includes(key)
            ? [JSON.stringify(rows.slice(offset, offset + 500)), userId]
            : [JSON.stringify(rows.slice(offset, offset + 500))],
        );
        imported[key] += result.rowCount ?? 0;
      }
    }
    return imported;
  });
}
