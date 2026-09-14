// Scheduled JSON backups of each user's library and current positions, stored in their
// own private Supabase storage bucket (separate from the public
// novel-covers bucket, which only accepts image/* and would reject a
// JSON upload outright — and backups are personal data that shouldn't
// be world-readable like covers are).
// Render restarts dynos freely, so scheduling is interval-checked
// rather than clock-aligned: every check, any user whose newest backup
// is older than BACKUP_MIN_AGE_HOURS gets a fresh one.

import { createClient } from '@supabase/supabase-js';
import { BACKUP_MAX_BYTES } from '../config.js';
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

async function touchLastBackupAttempt(
  userId: string,
  when: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key, value, updated_at)
     VALUES ($1, 'last_backup_attempt_at', $2, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [userId, when],
  );
}

async function rejectOversized(userId: string, bytes: number): Promise<never> {
  try {
    await touchLastBackupAttempt(userId, new Date().toISOString());
  } catch (settingsErr) {
    logger.error(
      { err: settingsErr, userId },
      'Failed to record backup-skip attempt',
    );
  }
  throw Object.assign(
    new Error(
      `Export too large to back up (${bytes} bytes > ${BACKUP_MAX_BYTES} limit)`,
    ),
    { code: 'BACKUP_TOO_LARGE' },
  );
}

export async function runBackup(userId: string): Promise<BackupFileInfo> {
  if (!supabase) throw new Error('Supabase storage not configured');

  const data = await buildExport(userId, 'library-backup');
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `readsync-backup-${stamp}.json`;
  const path = `${userId}/${name}`;
  const body = JSON.stringify(data);
  const bytes = Buffer.byteLength(body, 'utf8');

  if (bytes > BACKUP_MAX_BYTES) {
    await rejectOversized(userId, bytes);
  }

  // Supabase accepts strings directly; no explicit Blob allocation is needed.
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw new Error(`Backup upload failed: ${error.message}`);

  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO user_settings (user_id, key, value, updated_at)
     VALUES ($1, 'last_backup_at', $2, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [userId, now],
  );
  await touchLastBackupAttempt(userId, now);

  await pruneOldBackups(userId);
  logger.info({ userId, path, bytes }, 'Backup written');
  return { name, created_at: now, size: bytes };
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
  const users = await pool.query<{
    id: string;
    last_backup: string | null;
    last_attempt: string | null;
  }>(
    `SELECT u.id, s.value AS last_backup, a.value AS last_attempt
     FROM users u
     LEFT JOIN user_settings s ON s.user_id = u.id AND s.key = 'last_backup_at'
     LEFT JOIN user_settings a ON a.user_id = u.id AND a.key = 'last_backup_attempt_at'`,
  );

  for (const row of users.rows) {
    // Gate on the last *attempt* (success or a too-large skip), not just the
    // last success — otherwise a permanently-oversized export gets retried,
    // and its memory spike repeated, on every single scheduler tick.
    const gate = row.last_attempt ?? row.last_backup;
    const last = gate ? new Date(gate).getTime() : 0;
    const ageHours = (Date.now() - last) / 3_600_000;
    if (ageHours < BACKUP_MIN_AGE_HOURS) continue;
    try {
      await runBackup(row.id);
    } catch (err) {
      // rejectOversized() already recorded the attempt for BACKUP_TOO_LARGE,
      // so this branch only needs to pick the right log level.
      if ((err as { code?: string }).code === 'BACKUP_TOO_LARGE') {
        logger.warn(
          { userId: row.id },
          'Backup skipped: export exceeds size limit',
        );
      } else {
        logger.error({ err, userId: row.id }, 'Scheduled backup failed');
      }
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
