// Adapter between the wire format of GET /api/v1/novels and the flat
// Novel shape the pages consume.
//
// The server (src/routes/novels.ts) returns a bare array whose items
// carry nested latest_global / latest_per_device JSON built in SQL.
// The legacy vanilla dashboard consumes that shape directly, so the
// server response must not change; the React app flattens it here.

import type { DeviceProgress, Novel, NovelStatus, ReadThroughEntry } from '../types/index.js';

export interface RawLatestProgress {
  chapter_num: number;
  chapter_token: string | null;
  percent: number;
  device_id?: string;
  device_label: string | null;
  url: string | null;
  ts: string;
}

export interface RawNovel {
  novel_id: string;
  title: string;
  primary_url: string | null;
  author: string | null;
  genre: string | null;
  latest_chapter_num: number | null;
  latest_chapter_title: string | null;
  chapters_updated_at: string | null;
  site_latest_chapter_time_raw: string | null;
  site_latest_chapter_time: string | null;
  last_activity: string | null;
  status: NovelStatus;
  favorite: boolean;
  rating: number;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  current_read_through: number;
  read_history: ReadThroughEntry[];
  latest_global: RawLatestProgress | null;
  latest_per_device: Record<string, RawLatestProgress> | null;
}

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeNovel(raw: RawNovel): Novel {
  const g = raw.latest_global;
  const perDevice = raw.latest_per_device ?? {};

  const devices_reading: DeviceProgress[] = Object.entries(perDevice).map(
    ([device_id, d]) => ({
      device_id,
      device_label: d.device_label ?? device_id,
      chapter_num: toNumber(d.chapter_num),
      percent: toNumber(d.percent),
      url: d.url ?? '',
      created_at: d.ts,
    }),
  );

  return {
    novel_id: raw.novel_id,
    title: raw.title,
    primary_url: raw.primary_url,
    author: raw.author,
    genre: raw.genre,
    status: raw.status,
    favorite: raw.favorite,
    rating: raw.rating,
    notes: raw.notes,
    latest_chapter_num: raw.latest_chapter_num,
    latest_chapter_title: raw.latest_chapter_title,
    chapters_updated_at: raw.chapters_updated_at,
    site_latest_chapter_time: raw.site_latest_chapter_time,
    site_latest_chapter_time_raw: raw.site_latest_chapter_time_raw,
    last_activity: raw.last_activity,
    started_at: raw.started_at,
    completed_at: raw.completed_at,
    current_read_through: raw.current_read_through,
    read_history: raw.read_history ?? [],
    latest_chapter: g ? toNumber(g.chapter_num) : null,
    latest_percent: g ? toNumber(g.percent) : null,
    latest_url: g?.url ?? null,
    latest_device_id: g?.device_id ?? null,
    latest_device_label: g?.device_label ?? null,
    latest_read_at: g?.ts ?? null,
    devices_reading,
  };
}
