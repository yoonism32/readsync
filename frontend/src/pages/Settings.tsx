import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import toast from 'react-hot-toast';
import { backups as backupsApi, novels as novelsApi, settings as settingsApi, formatTimestamp } from '../api/client.js';
import type { BackupsStatus, Prefs, LibraryHealth } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { LoadError } from '../components/PageFeedback.js';
import { BookOpenIcon, DashboardIcon, ClockIcon, BotIcon, DownloadIcon, UploadIcon } from '../components/Icon.js';
import { useNow } from '../hooks/useNow.js';
import { useEffects, setEffects } from '../hooks/useEffects.js';

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
  const effects = useEffects();
  const { mutate: refreshCache } = useSWRConfig();
  useNow(); // ticks so "Xm ago" labels below advance without a data refetch
  const [notificationPermission, setNotificationPermission] = useState(readNotificationPermission);
  const { data: lastRefreshData, error: refreshError, mutate: retryRefresh } = useSWR(
    'settings-last-refresh',
    () => settingsApi.getLastRefresh(),
    { revalidateOnFocus: false },
  );
  const lastRefresh = lastRefreshData?.last_refresh ?? null;
  const { data: prefs, error: prefsError, mutate: mutatePrefs } = useSWR<Prefs>(
    'settings-prefs',
    () => settingsApi.getPrefs(),
    { revalidateOnFocus: false },
  );
  const { data: library, error: libraryError, mutate: retryLibrary } = useSWR<LibraryHealth>(
    'library-health',
    () => settingsApi.libraryHealth(),
    { revalidateOnFocus: false },
  );
  const { data: backupStatus, error: backupError, mutate: mutateBackups } = useSWR<BackupsStatus>(
    'backups-status',
    () => backupsApi.status(),
    { revalidateOnFocus: false },
  );
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup failed');
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
    if (!window.confirm('Importing will merge this file into your existing library and progress data. Continue?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await novelsApi.import(parsed);
      await refreshCache(key => typeof key === 'string' && key !== 'auth-status');
      toast.success(parsed.scope === 'library-backup'
        ? 'Library and positions imported. Detailed history is excluded from this backup.'
        : 'Import complete');
    } catch {
      toast.error('Import failed — check the file is a ReadSync export');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
    if (saving || !prefs) return;
    if (enabled && (notificationPermission === 'unsupported' || notificationPermission === 'denied')) {
      toast.error(notificationPermission === 'unsupported' ? 'This browser does not support notifications.' : 'Allow notifications in your browser’s site settings first.');
      return;
    }
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
    <div className="page-view animate-fade-in settings-page">
      <h1 className="page-title">Settings</h1>
      {prefsError && <LoadError subject="your preferences" onRetry={() => mutatePrefs()} />}

      <div className="settings-flow">
        <section className="settings-group" aria-labelledby="reading-preferences">
          <h2 id="reading-preferences">Reading preferences</h2>
          <div className="effects-setting">
            <div><h3>Interface effects</h3><p className="text-muted">Book-cover depth, page transitions, and animated controls. Saved for this browser.</p></div>
            <div className="time-window" role="group" aria-label="Interface effects">
              <button type="button" aria-pressed={effects === 'full'} onClick={() => setEffects('full')}>Full effects</button>
              <button type="button" aria-pressed={effects === 'quiet'} onClick={() => setEffects('quiet')}>Quiet</button>
            </div>
          </div>
          <div className="settings-pair">
        <section className="settings-section">
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 6 }}>Refresh reminders</h3>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 14 }}>
            How often ReadSync reminds you to check your library for new chapters.
          </p>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {REFRESH_CHOICES.map(h => {
              const active = prefs?.refresh_interval_hours === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => { void handleIntervalChange(h); }}
                  disabled={saving || !prefs || !!prefsError}
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
                  {h} hours
                </button>
              );
            })}
          </div>

          <p className="text-faint" style={{ fontSize: 'var(--text-xs)' }}>
            {refreshError ? 'Refresh status unavailable.' : !lastRefreshData ? 'Loading refresh status…' : lastRefresh
              ? `Last refreshed ${formatTimestamp(lastRefresh)}.`
              : 'No refresh recorded yet.'}
          </p>
          {refreshError && <LoadError subject="refresh status" onRetry={() => retryRefresh()} />}
        </section>
      {/* Notifications */}
      <section className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Desktop notifications</h3>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { void handleNotificationsToggle(!prefs?.notifications_enabled); }}
            disabled={saving || !prefs || !!prefsError || (!prefs.notifications_enabled && (notificationPermission === 'unsupported' || notificationPermission === 'denied'))}
            aria-label="Refresh notifications"
            aria-pressed={!!prefs?.notifications_enabled}
            style={{
              color: prefs?.notifications_enabled ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderColor: prefs?.notifications_enabled ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            {!prefs ? 'Unavailable' : prefs.notifications_enabled ? 'On' : 'Off'}
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          A desktop notification when your library is due a refresh. ReadSync only
          asks your browser for permission when you switch this on.
        </p>
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
          Browser permission: {notificationPermission === 'default' ? 'Not requested' : notificationPermission}
          {notificationPermission === 'denied' &&
            ' — you\'ll need to re-allow notifications in your browser\'s site settings.'}
        </p>
      </section>


          </div>
        </section>
        <section className="settings-group" aria-labelledby="backups-data">
          <h2 id="backups-data">Backups &amp; data</h2>
          <div className="settings-pair">
      {/* Export / Import */}
      <section className="settings-section">
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 4 }}>Export &amp; import</h3>
        <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 16 }}>
          Export your reading data to a JSON file for a manual backup, or import from a
          previous one.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-accent" onClick={() => { void handleExport(); }} disabled={exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <DownloadIcon size={14} />
            {exporting ? 'Exporting…' : 'Export Data'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UploadIcon size={14} />
            {importing ? 'Importing…' : 'Import Data'}
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
      <section className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Automatic backups</h3>
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
          A daily backup of your library, reading positions, bookmarks, notes,
          tags and preferences is stored automatically; the last 30 are kept.
          Detailed reading history, sessions and notifications are excluded.
        </p>
        <p className="text-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>
          {backupError ? 'Backup status unavailable.' : !backupStatus ? 'Loading backup status…' : backupStatus.last_backup_at
            ? `Last backup ${formatTimestamp(backupStatus.last_backup_at)} · ${backupStatus.backups.length} stored`
            : 'No backups yet.'}
        </p>
        {backupError && <LoadError subject="backup status" onRetry={() => mutateBackups()} />}
      </section>


          </div>
        </section>
        <section className="settings-section">
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 6 }}>Library</h3>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 14 }}>
            Stored library totals. Use these to check whether data is missing or just hidden by a filter.
          </p>

          {libraryError ? <LoadError subject="library details" onRetry={() => retryLibrary()} /> : !library ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner /></div>
          ) : (
            <>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 'var(--text-sm)' }}>
                <dt className="text-muted">Novels</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.novels_tracked}</dd>

                <dt className="text-muted">With progress</dt>
                <dd className="tabular" style={{ textAlign: 'right' }}>{library.novels_with_progress}</dd>

                <dt className="text-muted">Progress snapshots</dt>
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
      {/* Badge legend */}
      <details className="settings-disclosure">
        <summary>What the badges mean</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <LegendRow
            swatch={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: 'var(--color-success)' }} />}
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
            text="Way behind — more than 50 unread chapters."
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
      </details>


      {/* Quick links */}
      <section className="settings-links">
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 16 }}>Quick Links</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/mylist" className="btn-ghost" style={quickLinkStyle}><BookOpenIcon size={14} /> My Library</Link>
          <Link to="/dashboard" className="btn-ghost" style={quickLinkStyle}><DashboardIcon size={14} /> Dashboard</Link>
          <Link to="/history" className="btn-ghost" style={quickLinkStyle}><ClockIcon size={14} /> History</Link>
          <Link to="/admin" className="btn-ghost" style={quickLinkStyle}><BotIcon size={14} /> Bot Admin</Link>
        </div>
      </section>
      </div>
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
