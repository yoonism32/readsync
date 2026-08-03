// Typed API client — port of public/js/shared.js

const API_BASE = '/api/v1';
const KEY_STORAGE = 'readsync_api_key';

// ── Key management ────────────────────────────────────────

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

// ── Core fetch ────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  qs?: Record<string, string | number | boolean | undefined | null>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T = unknown>(
  path: string,
  { method = 'GET', body, qs = {} }: RequestOptions = {}
): Promise<T> {
  const key = getApiKey();
  if (!key) throw new ApiError(401, 'API key required. Please authenticate first.');

  const fullPath = path.startsWith('/api/v1') ? path
    : path.startsWith('/') ? `${API_BASE}${path}`
    : `${API_BASE}/${path}`;

  const url = new URL(fullPath, window.location.origin);
  url.searchParams.set('user_key', key);
  url.searchParams.set('_t', Date.now().toString());

  for (const [k, v] of Object.entries(qs)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json() as { error?: string; detail?: string };
      detail = j.error ?? j.detail ?? JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
  }

  return res.json() as Promise<T>;
}

// ── SWR fetcher ───────────────────────────────────────────
// Usage: useSWR('/novels', swrFetcher)

export function swrFetcher<T>(path: string): Promise<T> {
  return request<T>(path);
}

// ── Auth ──────────────────────────────────────────────────

export const auth = {
  status: () => fetch('/api/auth/status').then(r => r.json()) as Promise<{ authenticated: boolean; username?: string }>,
  login: (username: string, password: string) =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(r => r.json()) as Promise<{ success: boolean; error?: string }>,
  logout: () =>
    fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json()),
};

// ── Novels ────────────────────────────────────────────────

import type { Novel, NovelStatus } from '../types/index.js';
import { normalizeNovel } from './normalize.js';
import type { RawNovel } from './normalize.js';

/**
 * SWR fetcher for /novels paths. The server returns a bare RawNovel[]
 * (nested latest_global/latest_per_device); pages get the flat Novel[].
 */
export async function fetchNovels(path: string): Promise<Novel[]> {
  const raw = await request<RawNovel[]>(path);
  return raw.map(normalizeNovel);
}

/** Cover image URL for a novel — the endpoint requires the api key. */
export function coverUrl(novelId: string): string {
  return `/api/v1/covers/${encodeURIComponent(novelId)}?user_key=${encodeURIComponent(getApiKey())}`;
}

export const novels = {
  list: (params?: { status?: string; search?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return fetchNovels(`/novels${qs ? `?${qs}` : ''}`);
  },

  setStatus: (novelId: string, status: NovelStatus) =>
    request(`/novels/${encodeURIComponent(novelId)}/status`, {
      method: 'PUT',
      body: { status },
    }),

  setFavorite: (novelId: string, fav: boolean) =>
    request(`/novels/${encodeURIComponent(novelId)}/favorite`, {
      method: fav ? 'POST' : 'DELETE',
    }),

  delete: (novelId: string) =>
    request(`/novels/${encodeURIComponent(novelId)}`, { method: 'DELETE' }),

  setNotes: (novelId: string, notes: string) =>
    request(`/novels/${encodeURIComponent(novelId)}/notes`, {
      method: 'PUT',
      body: { notes },
    }),

  startReread: (novelId: string) =>
    request(`/novels/${encodeURIComponent(novelId)}/reread`, { method: 'POST' }),

  bulkStatus: (novelIds: string[], status: NovelStatus) =>
    request('/novels/bulk-status', { method: 'POST', body: { novel_ids: novelIds, status } }),

  export: () => request('/export'),
  import: (data: unknown) => request('/import', { method: 'POST', body: { data } }),
};

// ── Devices ───────────────────────────────────────────────

import type { Device } from '../types/index.js';

export const devices = {
  list: (includeInactive = false) =>
    request<Device[]>('/devices', { qs: { include_inactive: includeInactive } }),

  update: (deviceId: string, patch: { device_label?: string; active?: boolean }) =>
    request(`/devices/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: patch }),

  deactivate: (deviceId: string) =>
    request(`/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
};

// ── Stats ─────────────────────────────────────────────────

import type { StatsSummary } from '../types/index.js';

export const stats = {
  summary: () => request<StatsSummary>('/stats/summary'),
  daily: (params?: { days?: number; from?: string; to?: string }) =>
    request('/stats/daily', { qs: params as Record<string, string> }),
  novel: (novelId: string) =>
    request(`/stats/novels/${encodeURIComponent(novelId)}`),
};

// ── Bookmarks ─────────────────────────────────────────────

import type { Bookmark } from '../types/index.js';

export const bookmarks = {
  forNovel: (novelId: string) =>
    request<Bookmark[]>(`/bookmarks/${encodeURIComponent(novelId)}`),
  list: (params?: { bookmark_type?: string }) =>
    request<{ bookmarks: Bookmark[] }>('/bookmarks', { qs: params as Record<string, string> }),
  create: (data: { novel_id: string; chapter_url: string; percent: number; bookmark_type?: string; title?: string; note?: string }) =>
    request('/bookmarks', { method: 'POST', body: data }),
  update: (id: number, patch: Partial<Bookmark>) =>
    request(`/bookmarks/${id}`, { method: 'PUT', body: patch }),
  delete: (id: number) =>
    request(`/bookmarks/${id}`, { method: 'DELETE' }),
};

// ── Notes ─────────────────────────────────────────────────

import type { Note } from '../types/index.js';

export const notes = {
  forNovel: (novelId: string) =>
    request<Note[]>(`/novels/${encodeURIComponent(novelId)}/notes`),
  create: (novelId: string, note_text: string, chapter_num?: number) =>
    request(`/novels/${encodeURIComponent(novelId)}/notes`, {
      method: 'POST',
      body: { note_text, chapter_num },
    }),
  update: (id: number, note_text: string, chapter_num?: number) =>
    request(`/notes/${id}`, { method: 'PUT', body: { note_text, chapter_num } }),
  delete: (id: number) =>
    request(`/notes/${id}`, { method: 'DELETE' }),
};

// ── Settings ──────────────────────────────────────────────

export const settings = {
  getLastRefresh: () => request<{ last_refresh: string | null; updated_at: string | null }>('/settings/last-refresh'),
  setLastRefresh: (timestamp: string) =>
    request('/settings/last-refresh', { method: 'POST', body: { timestamp } }),
};

// ── Admin ─────────────────────────────────────────────────

import type { BotStatus } from '../types/index.js';

export const admin = {
  botStatus: () => request<BotStatus>('/admin/bot/status'),
  triggerBot: () => request('/admin/bot/trigger', { method: 'POST' }),
  botProgress: () => request('/admin/bot/progress'),
  staleNovels: (hours?: number) => request('/admin/novels/stale', { qs: { hours } }),
};

// ── Utilities (ported from shared.js) ────────────────────

export function formatTimestamp(
  ts: string | Date | null | undefined,
  { compact = true, showAgo = true } = {}
): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';

  const diff = Math.max(0, Date.now() - d.getTime());
  const s = diff / 1000;

  if (s < 60)   return compact ? 'now' : (showAgo ? 'just now' : 'now');
  const m = s / 60;
  if (m < 60)   return `${Math.floor(m)}${compact ? 'm' : ' min'}${showAgo ? ' ago' : ''}`;
  const h = m / 60;
  if (h < 24)   return `${Math.floor(h)}${compact ? 'h' : ' hr'}${showAgo ? ' ago' : ''}`;
  const dy = h / 24;
  if (dy < 30)  return `${Math.floor(dy)}${compact ? 'd' : ' days'}${showAgo ? ' ago' : ''}`;
  const mo = dy / 30;
  if (mo < 12)  return `${Math.floor(mo)}${compact ? 'mo' : ' months'}${showAgo ? ' ago' : ''}`;

  return d.toLocaleDateString();
}

export async function copyResumeLink(url: string, percent: number): Promise<void> {
  const clean = url.replace(/#.*$/, '');
  const link = `${clean}#nbp=${Number(percent).toFixed(1)}`;
  await navigator.clipboard.writeText(link);
}
