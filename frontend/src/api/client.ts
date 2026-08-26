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
    let detail: string;
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
    }).then(r => r.json()) as Promise<{ success: boolean; error?: string; api_key?: string | null }>,
  logout: () =>
    fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json()),
  recoverApiKey: () =>
    fetch('/api/auth/api-key').then(r => r.json()) as Promise<{ api_key: string | null }>,
};

// ── Novels ────────────────────────────────────────────────

import type { Novel, NovelStatus, NovelSynopsis } from '../types/index.js';
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

  synopsis: (novelId: string) =>
    request<NovelSynopsis>(`/novels/${encodeURIComponent(novelId)}/synopsis`),

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

  setRating: (novelId: string, rating: number) =>
    request(`/novels/${encodeURIComponent(novelId)}/rating`, {
      method: 'PUT',
      body: { rating },
    }),

  startReread: (novelId: string) =>
    request(`/novels/${encodeURIComponent(novelId)}/reread`, { method: 'POST' }),

  progressOverride: (novelId: string, chapter_num: number, percent = 0) =>
    request(`/novels/${encodeURIComponent(novelId)}/progress-override`, {
      method: 'POST',
      body: { chapter_num, percent },
    }),

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

import type { StatsBreakdown, StatsSummary } from '../types/index.js';

export const stats = {
  summary: () => request<StatsSummary>('/stats/summary'),
  daily: (params?: { days?: number; from?: string; to?: string }) =>
    request('/stats/daily', { qs: params as Record<string, string> }),
  novel: (novelId: string) =>
    request(`/stats/novels/${encodeURIComponent(novelId)}`),
  breakdown: () => request<StatsBreakdown>('/stats/breakdown'),
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

// ── Categories (tags) ─────────────────────────────────────

import type { CategoryAssignment } from '../types/index.js';

export const categories = {
  all: () => request<CategoryAssignment[]>('/categories'),
  add: (novelId: string, category: string) =>
    request(`/novels/${encodeURIComponent(novelId)}/categories`, {
      method: 'POST',
      body: { category },
    }),
  remove: (novelId: string, category: string) =>
    request(
      `/novels/${encodeURIComponent(novelId)}/categories/${encodeURIComponent(category)}`,
      { method: 'DELETE' },
    ),
};

// ── Notifications ─────────────────────────────────────────

import type { NotificationsResponse } from '../types/index.js';

export const notifications = {
  list: (unreadOnly = false) =>
    request<NotificationsResponse>('/notifications', {
      qs: unreadOnly ? { unread_only: true } : {},
    }),
  markRead: (id: number) =>
    request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () =>
    request('/notifications/read-all', { method: 'POST' }),
};

// ── Backups ───────────────────────────────────────────────

export interface BackupsStatus {
  last_backup_at: string | null;
  backups: { name: string; created_at: string; size: number }[];
}

export const backups = {
  status: () => request<BackupsStatus>('/backups'),
  run: () => request('/backups/run', { method: 'POST' }),
};

// ── Settings ──────────────────────────────────────────────

export interface Prefs {
  refresh_interval_hours: number;
  notifications_enabled: boolean;
}

export interface LibraryHealth {
  novels_tracked: number;
  novels_with_progress: number;
  novels_without_progress: number;
  progress_snapshots: number;
  oldest_snapshot: string | null;
  newest_snapshot: string | null;
  notes: number;
  bookmarks: number;
}

export const settings = {
  getLastRefresh: () => request<{ last_refresh: string | null; updated_at: string | null }>('/settings/last-refresh'),
  setLastRefresh: (timestamp: string) =>
    request('/settings/last-refresh', { method: 'POST', body: { timestamp } }),

  getPrefs: () => request<Prefs>('/settings/prefs'),
  savePrefs: (patch: Partial<Prefs>) =>
    request('/settings/prefs', { method: 'PUT', body: patch }),

  libraryHealth: () => request<LibraryHealth>('/stats/library'),
};

// ── Admin ─────────────────────────────────────────────────
// Chapter-update bot automation is intentionally disabled in production —
// see docs/ARCHITECTURE.md. No client methods for /admin/bot/* here; those
// routes 503 until a bot module is deliberately wired back in.

export const admin = {
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

/** Chapter URL with the userscript's #nbp scroll-restore hash appended. */
export function resumeUrl(url: string, percent: number | null | undefined): string {
  const clean = url.replace(/#.*$/, '');
  const p = Number(percent);
  return Number.isFinite(p) && p > 0 ? `${clean}#nbp=${p.toFixed(1)}` : clean;
}

export async function copyResumeLink(url: string, percent: number): Promise<void> {
  await navigator.clipboard.writeText(resumeUrl(url, percent));
}
