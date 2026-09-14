import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression test for the 2026-09-13 OOM: an oversized user export used to be
 * JSON.stringify'd, wrapped in a second Blob copy, and only then rejected by
 * Supabase's 50MB bucket limit — spiking Node memory before the failure was
 * even known. runBackup() must now reject on size *before* touching Blob or
 * the network, and upload a raw string (no second copy) otherwise.
 */
const { queryMock, buildExportMock, uploadMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  buildExportMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock('../../src/db/pool.js', () => ({
  default: { query: queryMock },
}));

vi.mock('../../src/services/ExportService.js', () => ({
  buildExport: buildExportMock,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

async function loadBackupService() {
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  return import('../../src/services/BackupService.js');
}

describe('BackupService size guard', () => {
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue({ rows: [] });
    uploadMock.mockReset().mockResolvedValue({ error: null });
    buildExportMock.mockReset();
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  });

  it('rejects an oversized export before uploading', async () => {
    const { runBackup } = await loadBackupService();
    buildExportMock.mockResolvedValue({
      version: 2,
      novels: [{ text: 'x'.repeat(19 * 1024 * 1024) }], // over the 18MB restore-safe ceiling
    });

    await expect(runBackup('user-1')).rejects.toMatchObject({
      code: 'BACKUP_TOO_LARGE',
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('last_backup_attempt_at'),
      ['user-1', expect.any(String)],
    );
  });

  it('requests a compact backup without a full-history size scan', async () => {
    const { runBackup } = await loadBackupService();
    buildExportMock.mockResolvedValue({ version: 2, novels: [] });

    await runBackup('user-1');
    expect(buildExportMock).toHaveBeenCalledWith('user-1', 'library-backup');
    expect(queryMock.mock.calls.some(([sql]) => sql.includes('progress_snapshots'))).toBe(false);
  });

  it('uploads a normal-sized export as a raw string, not a Blob', async () => {
    const { runBackup } = await loadBackupService();
    buildExportMock.mockResolvedValue({ version: 2, novels: [] });

    await runBackup('user-1');

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [, body] = uploadMock.mock.calls[0] as [string, unknown];
    expect(typeof body).toBe('string');
  });
});
