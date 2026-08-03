import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { swrFetcher, devices as devicesApi, backups as backupsApi, formatTimestamp, getApiKey, setApiKey as saveApiKey } from '../api/client.js';
import type { BackupsStatus } from '../api/client.js';
import { DeviceBadge } from '../components/DeviceBadge.js';
import { Spinner } from '../components/Spinner.js';
import type { Device } from '../types/index.js';

export function Settings() {
  const { data: deviceList, isLoading, mutate } = useSWR<Device[]>('/devices', swrFetcher);
  const { data: backupStatus, mutate: mutateBackups } = useSWR<BackupsStatus>(
    'backups-status',
    () => backupsApi.status(),
    { revalidateOnFocus: false },
  );
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  async function handleBackupNow() {
    setBackingUp(true);
    try {
      await backupsApi.run();
      await mutateBackups();
      toast.success('Backup complete');
    } catch {
      toast.error('Backup failed');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleSaveKey(e: { preventDefault(): void }): Promise<void> {
    e.preventDefault();
    saveApiKey(apiKeyInput.trim());
    toast.success('API key saved');
  }

  async function handleDeactivate(deviceId: string) {
    setSaving(true);
    try {
      await devicesApi.deactivate(deviceId);
      await mutate();
      toast.success('Device deactivated');
    } catch {
      toast.error('Failed to deactivate');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      {/* API Key */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 4 }}>API Key</h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 16 }}>
          Used by the browser extension to sync your reading progress.
        </p>
        <form onSubmit={(e) => { void handleSaveKey(e); }} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            name="api-key"
            autoComplete="off"
            spellCheck={false}
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="Paste your API key…"
            style={{
              flex: 1,
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              color: 'var(--color-text)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-gold)')}
            onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
          />
          <button
            type="submit"
            style={{
              background: 'var(--color-gold)',
              color: '#080c12',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Save API Key
          </button>
        </form>
      </section>

      {/* Backups */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Backups</h2>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { void handleBackupNow(); }}
            disabled={backingUp}
          >
            {backingUp ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          A daily snapshot of your full library (novels, progress, bookmarks, notes,
          tags) is stored automatically; the last 30 are kept.
        </p>
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
          {backupStatus?.last_backup_at
            ? `Last backup ${formatTimestamp(backupStatus.last_backup_at)} · ${backupStatus.backups.length} stored`
            : 'No backups yet.'}
        </p>
      </section>

      {/* Devices */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>Devices</h2>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(deviceList ?? []).map(d => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <DeviceBadge label={d.device_label} type={d.device_type} />
                <span className="text-muted" style={{ fontSize: 'var(--text-xs)', flex: 1 }}>
                  {d.total_snapshots} syncs · last seen {new Date(d.last_seen).toLocaleDateString()}
                </span>
                <button
                  onClick={() => { void handleDeactivate(d.id); }}
                  disabled={saving}
                  aria-label={`Deactivate ${d.device_label}`}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '3px 8px',
                    color: 'var(--color-danger)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {(deviceList ?? []).length === 0 && (
              <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>No active devices.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
