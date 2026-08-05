import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { backups as backupsApi, novels as novelsApi, settings as settingsApi, formatTimestamp, getApiKey, setApiKey as saveApiKey } from '../api/client.js';
import type { BackupsStatus, Prefs, LibraryHealth } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { BookOpenIcon, DashboardIcon, ClockIcon, BotIcon } from '../components/Icon.js';

const quickLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
};

const REFRESH_CHOICES = [6, 12, 24, 48] as const;

function readNotificationPermission(): string {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function Settings() {
  const [notificationPermission, setNotificationPermission] = useState(readNotificationPermission);
  const { data: lastRefreshData } = useSWR(
    'settings-last-refresh',
    () => settingsApi.getLastRefresh(),
    { revalidateOnFocus: false },
  );
  const lastRefresh = lastRefreshData?.last_refresh ?? null;
  const { data: prefs, mutate: mutatePrefs } = useSWR<Prefs>(
    'settings-prefs',
    () => settingsApi.getPrefs(),
    { revalidateOnFocus: false },
  );
  const { data: library } = useSWR<LibraryHealth>(
    'library-health',
    () => settingsApi.libraryHealth(),
    { revalidateOnFocus: false },
  );
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

  async function handleIntervalChange(hours: number) {
    setSaving(true);
    try {
      await settingsApi.savePrefs({ refresh_interval_hours: hours });
      await mutatePrefs();
      // Silent success: the chosen interval button becomes active.
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleNotificationsToggle(enabled: boolean) {
    // Only ask the browser at the moment the reader opts in — the prompt is
    // one-shot per origin and a denial sticks, so spending it on page load
    // would permanently disable alerts for someone who never asked for them.
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const granted = await Notification.requestPermission();
      setNotificationPermission(granted);
      if (granted !== 'granted') {
        toast.error('Your browser blocked notifications');
        return;
      }
    }

    setSaving(true);
    try {
      await settingsApi.savePrefs({ notifications_enabled: enabled });
      await mutatePrefs();
      // Silent success: the toggle reads On/Off directly.
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      {/* API Key */}
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
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
            className="input"
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
          />
          <button type="submit" className="btn-accent">
            Save API Key
          </button>
        </form>
      </section>

      {/* Export / Import */}
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
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
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginBottom: 16 }}>
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

      {/* Refresh + Library share the width the Devices list used to fill. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 6 }}>Refresh</h2>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 14 }}>
            How often ReadSync reminds you to check your library for new chapters.
          </p>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {REFRESH_CHOICES.map(h => {
              const active = (prefs?.refresh_interval_hours ?? 24) === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => { void handleIntervalChange(h); }}
                  disabled={saving}
                  aria-pressed={active}
                  style={{
                    background: active ? 'var(--color-accent)' : 'none',
                    color: active ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '5px 12px',
                    fontSize: 'var(--text-sm)',
                    fontWeight: active ? 600 : 400,
                    fontFamily: 'inherit',
                    cursor: saving ? 'default' : 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  {h}h
                </button>
              );
            })}
          </div>

          <p className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>
            {lastRefresh
              ? `Last refreshed ${formatTimestamp(lastRefresh)}.`
              : 'No refresh recorded yet.'}
          </p>
        </section>

        <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 6 }}>Library</h2>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 14 }}>
            What's actually stored, so a display glitch can be told apart from missing data.
          </p>

          {!library ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>
          ) : (
            <>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 'var(--text-sm)' }}>
                <dt className="text-muted">Novels</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.novels_tracked}</dd>

                <dt className="text-muted">With progress</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.novels_with_progress}</dd>

                <dt className="text-muted">Snapshots</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.progress_snapshots.toLocaleString()}</dd>

                <dt className="text-muted">Notes · bookmarks</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.notes} · {library.bookmarks}</dd>
              </dl>

              <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 12 }}>
                {library.oldest_snapshot
                  ? `Tracking since ${new Date(library.oldest_snapshot).toLocaleDateString()}.`
                  : 'No progress recorded yet.'}
                {library.novels_without_progress > 0 &&
                  ` ${library.novels_without_progress} novel${library.novels_without_progress === 1 ? '' : 's'} have no progress recorded.`}
              </p>
            </>
          )}
        </section>
      </div>

      {/* Notifications */}
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Notifications</h2>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { void handleNotificationsToggle(!prefs?.notifications_enabled); }}
            disabled={saving}
            aria-pressed={!!prefs?.notifications_enabled}
            style={{
              color: prefs?.notifications_enabled ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderColor: prefs?.notifications_enabled ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            {prefs?.notifications_enabled ? 'On' : 'Off'}
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          A desktop notification when your library is due a refresh. ReadSync only
          asks your browser for permission when you switch this on.
        </p>
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
          Browser permission: {notificationPermission}
          {notificationPermission === 'denied' &&
            ' — you\'ll need to re-allow notifications in your browser\'s site settings.'}
        </p>
      </section>

      {/* Badge legend */}
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>What the badges mean</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <LegendRow
            swatch={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: 'var(--color-success)', boxShadow: '0 0 6px var(--color-success)' }} />}
            text="New chapters, manageable — 1 to 10 unread."
          />
          <LegendRow
            swatch={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: 'var(--color-info)' }} />}
            text="Caught up — no new chapters since your last read."
          />
          <LegendRow
            swatch={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: 'var(--color-warning)' }} />}
            text="Behind — 11 to 50 unread chapters."
          />
          <LegendRow
            swatch={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: 'var(--color-danger)' }} />}
            text="Way behind — 50+ unread chapters."
          />
          <LegendRow
            swatch={<span className="tabular" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-on-teal)', background: 'var(--color-teal)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>+8</span>}
            text="Unread chapters since your last read — the count on the site minus your bookmark."
          />
          <LegendRow
            swatch={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', background: 'var(--color-warning-dim)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>hiatus?</span>}
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
      <section className="panel" style={{ borderRadius: 'var(--radius-xl)', padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>Quick Links</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/mylist" className="btn-ghost" style={quickLinkStyle}><BookOpenIcon size={14} /> My Library</Link>
          <Link to="/dashboard" className="btn-ghost" style={quickLinkStyle}><DashboardIcon size={14} /> Dashboard</Link>
          <Link to="/history" className="btn-ghost" style={quickLinkStyle}><ClockIcon size={14} /> History</Link>
          <Link to="/admin" className="btn-ghost" style={quickLinkStyle}><BotIcon size={14} /> Bot Admin</Link>
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
