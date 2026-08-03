import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { swrFetcher, devices as devicesApi, backups as backupsApi, novels as novelsApi, formatTimestamp, getApiKey, setApiKey as saveApiKey } from '../api/client.js';
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
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleExport() {
    setExporting(true);
    try {
      const data = await novelsApi.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `readsync-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await novelsApi.import(parsed);
      toast.success('Import complete');
    } catch {
      toast.error('Import failed — check the file is a ReadSync export');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          <button type="submit" className="btn-accent">
            Save API Key
          </button>
        </form>
      </section>

      {/* Export / Import */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 4 }}>Backup &amp; Restore</h2>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 16 }}>
          Export your reading data to a JSON file for a manual backup, or import from a
          previous one.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-accent" onClick={() => { void handleExport(); }} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Export Data'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : '⬆ Import Data'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
        </div>
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 12 }}>
          What gets exported: all novels, progress history, bookmarks, notes, and tags.
        </p>
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

      {/* Badge legend */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>What the badges mean</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <LegendRow
            swatch={<span className="tabular" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#07110f', background: 'var(--color-teal)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>+8</span>}
            text="Unread chapters since your last read — the count on the site minus your bookmark."
          />
          <LegendRow
            swatch={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>hiatus?</span>}
            text="No new chapter on the site in 90+ days while you're still marked Reading."
          />
          <LegendRow
            swatch={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-bright)', background: 'var(--color-accent-glow)', border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-full)', padding: '0 8px' }}>2nd read</span>}
            text="You're on a re-read — the novel page keeps every past run in its history."
          />
          <LegendRow
            swatch={<span style={{ color: 'var(--color-warning)' }}>★</span>}
            text="Favorited — click the star on any row to toggle it."
          />
        </div>
      </section>

      {/* Quick links */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>Quick Links</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/mylist" className="btn-ghost" style={{ textDecoration: 'none' }}>📚 My Library</Link>
          <Link to="/dashboard" className="btn-ghost" style={{ textDecoration: 'none' }}>📊 Dashboard</Link>
          <Link to="/history" className="btn-ghost" style={{ textDecoration: 'none' }}>🕐 History</Link>
          <Link to="/admin" className="btn-ghost" style={{ textDecoration: 'none' }}>🤖 Bot Admin</Link>
        </div>
      </section>
    </div>
  );
}

function LegendRow({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flexShrink: 0, minWidth: 64, textAlign: 'center' }}>{swatch}</span>
      <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>{text}</span>
    </div>
  );
}
