import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ list: mocks.list }) } }),
}));
vi.mock('../../src/db/pool.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../src/services/ExportService.js', () => ({ buildExport: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  mocks.list.mockReset();
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('backup inventory status', () => {
  it('distinguishes an empty reachable store from a storage failure', async () => {
    const { getBackupInventory, listBackups } = await import('../../src/services/BackupService.js');
    mocks.list.mockResolvedValue({ data: [], error: null });
    expect(await getBackupInventory('owner')).toEqual({ status: 'available', files: [], truncated: false });
    expect(mocks.list).toHaveBeenCalledWith('owner', expect.objectContaining({ limit: 100 }));
    mocks.list.mockResolvedValue({ data: null, error: new Error('unreachable') });
    expect((await getBackupInventory('owner')).status).toBe('unavailable');
    expect(await listBackups('owner')).toEqual([]);
    mocks.list.mockRejectedValue(new Error('network failure'));
    expect((await getBackupInventory('owner')).status).toBe('unavailable');
  });
  it('does not claim storage is available when it is unconfigured', async () => {
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    const { getBackupInventory } = await import('../../src/services/BackupService.js');
    expect((await getBackupInventory('owner')).status).toBe('not_configured');
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('flags a potentially incomplete inventory rather than claiming a total', async () => {
    const { getBackupInventory } = await import('../../src/services/BackupService.js');
    mocks.list.mockResolvedValue({ data: Array.from({ length: 100 }, (_, i) => ({ name: `${i}.json`, created_at: '2026-10-01', metadata: { size: 42 } })), error: null });
    const inventory = await getBackupInventory('owner');
    expect(inventory.truncated).toBe(true);
    expect(inventory.files[0].size).toBe(42);
  });
});
