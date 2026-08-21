// Scheduled JSON backups of each user's full export, stored in their
// own private Supabase storage bucket (separate from the public
// novel-covers bucket, which only accepts image/* and would reject a
// JSON upload outright — and backups are personal data that shouldn't
// be world-readable like covers are).
// Render restarts dynos freely, so scheduling is interval-checked
// rather than clock-aligned: every check, any user whose newest backup
// is older than BACKUP_MIN_AGE_HOURS gets a fresh one.

import { createClient } from '@supabase/supabase-js';
import pool from '../db/pool.js';
import logger from '../logger.js';
import { buildExport } from './ExportService.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const BUCKET = 'readsync-backups';

export const BACKUPS_TO_KEEP = 30;
const BACKUP_MIN_AGE_HOURS = 20;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BOOT_DELAY_MS = 60 * 1000;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

export interface BackupFileInfo {
  name: string;
  created_at: string;
  size: number;
}

export async function listBackups(userId: string): Promise<BackupFileInfo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) {
    logger.warn({ error, userId }, 'Backup list failed');
    return [];
  }
  return (data ?? []).map((f) => ({
    name: f.name,
    created_at: f.created_at ?? '',
    size: (f.metadata as { size?: number } | null)?.size ?? 0,
  }));
}

export async function runBackup(userId: string): Promise<BackupFileInfo> {
  if (!supabase) throw new Error('Supabase storage not configured');

  const data = await buildExport(userId);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `readsync-backup-${stamp}.json`;
  const path = `${userId}/${name}`;
  const body = JSON.stringify(data);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([body], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
    });
  if (error) throw new Error(`Backup upload failed: ${error.message}`);

  await pool.query(
    `INSERT INTO user_settings (user_id, key, value, updated_at)
     VALUES ($1, 'last_backup_at', $2, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [userId, new Date().toISOString()],
  );

  await pruneOldBackups(userId);
  logger.info({ userId, path, bytes: body.length }, 'Backup written');
  return { name, created_at: new Date().toISOString(), size: body.length };
}

async function pruneOldBackups(userId: string): Promise<void> {
  if (!supabase) return;
  const files = await listBackups(userId);
  // Date-stamped names sort chronologically, so name-desc = newest first.
  const stale = files
    .map((f) => f.name)
    .sort()
    .reverse()
    .slice(BACKUPS_TO_KEEP);
  if (stale.length === 0) return;
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(stale.map((n) => `${userId}/${n}`));
  if (error) logger.warn({ error, userId }, 'Backup prune failed');
  else logger.info({ userId, removed: stale.length }, 'Old backups pruned');
}

async function backupDueUsers(): Promise<void> {
  if (!supabase) return;
  const users = await pool.query<{ id: string; last_backup: string | null }>(
    `SELECT u.id, s.value AS last_backup
     FROM users u
     LEFT JOIN user_settings s ON s.user_id = u.id AND s.key = 'last_backup_at'`,
  );

  for (const row of users.rows) {
    const last = row.last_backup ? new Date(row.last_backup).getTime() : 0;
    const ageHours = (Date.now() - last) / 3_600_000;
    if (ageHours < BACKUP_MIN_AGE_HOURS) continue;
    try {
      await runBackup(row.id);
    } catch (err) {
      logger.error({ err, userId: row.id }, 'Scheduled backup failed');
    }
  }
}

export function startBackupScheduler(): void {
  if (!supabase) {
    logger.warn('Backup scheduler disabled — Supabase storage not configured');
    return;
  }
  setTimeout(() => {
    void backupDueUsers();
  }, BOOT_DELAY_MS);
  setInterval(() => {
    void backupDueUsers();
  }, CHECK_INTERVAL_MS);
  logger.info(
    { everyHours: CHECK_INTERVAL_MS / 3_600_000, keep: BACKUPS_TO_KEEP },
    'Backup scheduler started',
  );
}
