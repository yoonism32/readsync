// Port of the legacy "Refresh All Novels" pipeline: open each novel's
// site page in a background tab (batched, Cloudflare-friendly), where
// the userscript scrapes the latest chapter info, POSTs it to the
// server, signals back via postMessage, and the tab is closed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { settings } from '../api/client.js';
import type { Novel } from '../types/index.js';

export const REFRESH_INTERVAL_HOURS = 24;
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 5000;
const NOVEL_TIMEOUT_MS = 30000;
const TAB_CLOSE_GRACE_MS = 1000;

interface UpdateSignal {
  type: string;
  novelId: string;
  success: boolean;
  reason?: string;
  status?: number;
  error?: string;
}

/** Why a single novel did not refresh. `ok` carries no reason. */
type RefreshOutcome = { ok: true } | { ok: false; reason: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function refreshSingleNovel(novel: Novel): Promise<RefreshOutcome> {
  return new Promise(resolve => {
    const url = novel.primary_url;
    if (!url) return resolve({ ok: false, reason: 'no_url' });

    const tab = window.open(url, `_novel_${novel.novel_id}`);
    if (!tab) return resolve({ ok: false, reason: 'popup_blocked' });

    let settled = false;
    const finish = (outcome: RefreshOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(watcher);
      clearTimeout(timeout);
      resolve(outcome);
    };

    // The userscript posts from the novelarrow tab with target '*';
    // match strictly on shape + novel id rather than origin.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as UpdateSignal | undefined;
      if (!data || data.type !== 'NOVEL_UPDATE_COMPLETE') return;
      if (data.novelId !== novel.novel_id) return;
      setTimeout(() => {
        try { tab.close(); } catch { /* */ }
        if (data.success) return finish({ ok: true });
        // The userscript already classifies the failure — keep its word, and
        // fold the HTTP status in so an api_error says which status.
        const reason = data.status
          ? `${data.reason ?? 'api_error'}:${data.status}`
          : (data.reason ?? 'unknown');
        finish({ ok: false, reason });
      }, TAB_CLOSE_GRACE_MS);
    };

    // Fallbacks: the tab closing itself counts as success; timeout fails.
    const watcher = setInterval(() => {
      if (tab.closed) finish({ ok: true });
    }, 500);
    const timeout = setTimeout(() => {
      try { tab.close(); } catch { /* */ }
      finish({ ok: false, reason: 'timeout' });
    }, NOVEL_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
  });
}

/** A novel that did not refresh, kept so the UI can name it. */
export interface RefreshFailure {
  novelId: string;
  title: string;
  reason: string;
}

export interface RefreshAllState {
  isRefreshing: boolean;
  progress: { done: number; total: number } | null;
  lastRefresh: string | null;
  needsRefresh: boolean;
  /** Minutes remaining until due, or 0 once due. Ticks live. */
  minutesUntilDue: number | null;
  summary: string | null;
  /** Populated by the last run; empty when everything succeeded. */
  failures: RefreshFailure[];
  refreshAll: (novels: Novel[]) => Promise<void>;
}

const TICK_MS = 30_000;

export function useRefreshAll(): RefreshAllState {
  const { mutate } = useSWRConfig();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [failures, setFailures] = useState<RefreshFailure[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const runningRef = useRef(false);
  const notifiedRef = useRef(false);

  const [intervalHours, setIntervalHours] = useState(REFRESH_INTERVAL_HOURS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    settings
      .getLastRefresh()
      .then(d => setLastRefresh(d.last_refresh))
      .catch(() => { /* non-fatal */ });
    // Deliberately no requestPermission() here. Asking on every page load
    // spends the browser's one-shot prompt without the reader ever opting in —
    // and a denial is sticky. Settings asks, only when the toggle is turned on.
    settings
      .getPrefs()
      .then(p => {
        setIntervalHours(p.refresh_interval_hours);
        setNotificationsEnabled(p.notifications_enabled);
      })
      .catch(() => { /* keep the defaults */ });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const minutesUntilDue = lastRefresh
    ? Math.max(
        0,
        Math.round(
          (new Date(lastRefresh).getTime() + intervalHours * 3_600_000 - nowTick) / 60_000,
        ),
      )
    : null;

  useEffect(() => {
    if (minutesUntilDue !== 0 || notifiedRef.current) return;
    notifiedRef.current = true;
    if (!notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('ReadSync — Time to Refresh!', {
      body: `It's been ${intervalHours}h since your last refresh. Click Refresh All Novels to update your library.`,
    });
  }, [minutesUntilDue, notificationsEnabled, intervalHours]);

  const refreshAll = useCallback(
    async (novels: Novel[]) => {
      if (runningRef.current) return;
      const targets = novels.filter(n => n.primary_url && n.status !== 'removed');
      if (targets.length === 0) return;

      runningRef.current = true;
      setIsRefreshing(true);
      setSummary(null);
      setFailures([]);
      setProgress({ done: 0, total: targets.length });

      let ok = 0;
      let failed = 0;
      const collected: RefreshFailure[] = [];

      for (let start = 0; start < targets.length; start += BATCH_SIZE) {
        const batch = targets.slice(start, start + BATCH_SIZE);
        const results = await Promise.all(batch.map(refreshSingleNovel));
        results.forEach((r, i) => {
          if (r.ok) {
            ok++;
            return;
          }
          failed++;
          collected.push({
            novelId: batch[i].novel_id,
            title: batch[i].title,
            reason: r.reason,
          });
        });
        setProgress({ done: Math.min(start + BATCH_SIZE, targets.length), total: targets.length });
        if (start + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
      }

      const now = new Date().toISOString();
      try {
        await settings.setLastRefresh(now);
      } catch { /* non-fatal */ }
      setLastRefresh(now);
      notifiedRef.current = false;
      await mutate('/novels');

      setSummary(failed === 0 ? `Refreshed ${ok} novels` : `Refreshed ${ok}, ${failed} failed`);
      setFailures(collected);
      setProgress(null);
      setIsRefreshing(false);
      runningRef.current = false;
    },
    [mutate],
  );

  const needsRefresh = minutesUntilDue === 0;

  return {
    isRefreshing,
    progress,
    lastRefresh,
    needsRefresh,
    minutesUntilDue,
    summary,
    failures,
    refreshAll,
  };
}
