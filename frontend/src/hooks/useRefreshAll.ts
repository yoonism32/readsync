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
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function refreshSingleNovel(novel: Novel): Promise<boolean> {
  return new Promise(resolve => {
    const url = novel.primary_url;
    if (!url) return resolve(false);

    const tab = window.open(url, `_novel_${novel.novel_id}`);
    if (!tab) return resolve(false); // popup blocked

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(watcher);
      clearTimeout(timeout);
      resolve(ok);
    };

    // The userscript posts from the novelarrow tab with target '*';
    // match strictly on shape + novel id rather than origin.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as UpdateSignal | undefined;
      if (!data || data.type !== 'NOVEL_UPDATE_COMPLETE') return;
      if (data.novelId !== novel.novel_id) return;
      setTimeout(() => {
        try { tab.close(); } catch { /* */ }
        finish(Boolean(data.success));
      }, TAB_CLOSE_GRACE_MS);
    };

    // Fallbacks: the tab closing itself counts as success; timeout fails.
    const watcher = setInterval(() => {
      if (tab.closed) finish(true);
    }, 500);
    const timeout = setTimeout(() => {
      try { tab.close(); } catch { /* */ }
      finish(false);
    }, NOVEL_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
  });
}

export interface RefreshAllState {
  isRefreshing: boolean;
  progress: { done: number; total: number } | null;
  lastRefresh: string | null;
  needsRefresh: boolean;
  summary: string | null;
  refreshAll: (novels: Novel[]) => Promise<void>;
}

export function useRefreshAll(): RefreshAllState {
  const { mutate } = useSWRConfig();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    settings
      .getLastRefresh()
      .then(d => setLastRefresh(d.last_refresh))
      .catch(() => { /* non-fatal */ });
  }, []);

  const refreshAll = useCallback(
    async (novels: Novel[]) => {
      if (runningRef.current) return;
      const targets = novels.filter(n => n.primary_url && n.status !== 'removed');
      if (targets.length === 0) return;

      runningRef.current = true;
      setIsRefreshing(true);
      setSummary(null);
      setProgress({ done: 0, total: targets.length });

      let ok = 0;
      let failed = 0;

      for (let start = 0; start < targets.length; start += BATCH_SIZE) {
        const batch = targets.slice(start, start + BATCH_SIZE);
        const results = await Promise.all(batch.map(refreshSingleNovel));
        for (const r of results) r ? ok++ : failed++;
        setProgress({ done: Math.min(start + BATCH_SIZE, targets.length), total: targets.length });
        if (start + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
      }

      const now = new Date().toISOString();
      try {
        await settings.setLastRefresh(now);
      } catch { /* non-fatal */ }
      setLastRefresh(now);
      await mutate('/novels');

      setSummary(failed === 0 ? `Refreshed ${ok} novels` : `Refreshed ${ok}, ${failed} failed`);
      setProgress(null);
      setIsRefreshing(false);
      runningRef.current = false;
    },
    [mutate],
  );

  const needsRefresh =
    lastRefresh != null &&
    Date.now() - new Date(lastRefresh).getTime() > REFRESH_INTERVAL_HOURS * 3_600_000;

  return { isRefreshing, progress, lastRefresh, needsRefresh, summary, refreshAll };
}
