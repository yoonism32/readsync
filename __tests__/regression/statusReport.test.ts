import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthenticatedRequest } from '../../src/types/index.js';

const mocks = vi.hoisted(() => ({ query: vi.fn(), inventory: vi.fn() }));
vi.mock('../../src/db/pool.js', () => ({ default: { query: mocks.query } }));
vi.mock('../../src/services/BackupService.js', () => ({
  BACKUP_MIN_AGE_HOURS: 20, getBackupInventory: mocks.inventory,
}));
import statusRouter from '../../src/routes/status.js';

function app(authenticated = true) {
  const result = express();
  if (authenticated) result.use((req, _res, next) => {
    (req as AuthenticatedRequest).user = { id: 'report-owner', display_name: 'Owner' };
    next();
  });
  return result.use(statusRouter);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.inventory.mockResolvedValue({ status: 'available', files: [{ size: 1024 }, { size: 2048 }], truncated: false });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM user_settings')) return { rows: [
      { key: 'last_novel_refresh', value: '2020-01-01T00:00:00Z' },
      { key: 'refresh_interval_hours', value: '12' },
      { key: 'last_backup_at', value: '2020-01-01T00:00:00Z' },
      { key: 'last_backup_attempt_at', value: '2020-01-02T00:00:00Z' },
    ] };
    if (sql.includes('WITH activity')) return { rows: [{ total_novels: 1, by_status: { reading: 1 }, novels_behind: 1, chapters_behind: 5, last_metadata_update_at: null, recent_reading: [{ novel_id: 'novel:one', title: 'One', chapter: 10 }] }] };
    return { rows: [{ progress_snapshots: 40, last_sync_at: null, notes: 2, bookmarks: 3, reading_sessions: 5, reading_seconds: '3600', active_devices: 1 }] };
  });
});

describe('personal status report', () => {
  it('rejects anonymous requests before reading personal records or storage', async () => {
    expect((await request(app(false)).get('/api/v1/status')).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.inventory).not.toHaveBeenCalled();
  });

  it('combines scoped facts, refresh reminders and backup eligibility without scheduling claims', async () => {
    const response = await request(app()).get('/api/v1/status');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.refresh).toMatchObject({ due_at: '2020-01-01T12:00:00.000Z', state: 'due', automatic: false });
    expect(response.body.backups.next_eligible_at).toBe('2020-01-02T20:00:00.000Z');
    expect(response.body.storage).toMatchObject({ backup_bytes: 3072, backup_file_count: 2 });
    expect(response.body.reading.completed_session_seconds).toBe(3600);
    expect(response.body.reading.recent[0].novel_id).toBe('novel:one');
    for (const [, params] of mocks.query.mock.calls) expect(params[0]).toBe('report-owner');
    expect(mocks.inventory).toHaveBeenCalledWith('report-owner');
  });

  it('marks unavailable storage as partial, never as zero bytes', async () => {
    mocks.inventory.mockResolvedValue({ status: 'unavailable', files: [], truncated: false });
    const { body } = await request(app()).get('/api/v1/status');
    expect(body.report_status).toBe('partial');
    expect(body.storage.backup_bytes).toBeNull();
    expect(body.storage.backup_file_count).toBeNull();
    expect(body.library.total_novels).toBe(1);
  });

  it('handles a new account without inventing reading history or refresh dates', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_settings')) return { rows: [{ key: 'last_novel_refresh', value: 'invalid-date' }] };
      if (sql.includes('WITH activity')) return { rows: [{ total_novels: 0, by_status: null, novels_behind: 0, chapters_behind: 0, last_metadata_update_at: null, recent_reading: [] }] };
      return { rows: [{ progress_snapshots: 0, last_sync_at: null, notes: 0, bookmarks: 0, reading_sessions: 0, reading_seconds: '0', active_devices: 0 }] };
    });
    mocks.inventory.mockResolvedValue({ status: 'not_configured', files: [], truncated: false });
    const { body } = await request(app()).get('/api/v1/status');
    expect(body.refresh).toMatchObject({ state: 'never_recorded', last_refresh_at: null, due_at: null, interval_hours: 24 });
    expect(body.reading.recent).toEqual([]);
    expect(body.backups.next_eligible_at).toBeNull();
    expect(body.backups.storage_status).toBe('not_configured');
  });
});
