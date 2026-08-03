/**
 * Regression tests for the React SPA data-contract fix.
 *
 * GET /api/v1/novels returns a bare array whose items carry nested
 * latest_global / latest_per_device JSON (built server-side in
 * src/routes/novels.ts), while the React pages consume a flat Novel
 * shape (latest_percent, latest_read_at, ...). normalizeNovel() is the
 * adapter; before it existed the SPA rendered an empty library because
 * pages read `data?.novels` off a bare array.
 */
import { describe, it, expect } from 'vitest';
import { normalizeNovel } from '../../frontend/src/api/normalize.js';
import type { RawNovel } from '../../frontend/src/api/normalize.js';

const baseRaw: RawNovel = {
  novel_id: 'novelbin:martial-peak',
  title: 'Martial Peak',
  primary_url: 'https://novelarrow.com/novel/martial-peak',
  author: 'Momo',
  genre: 'Action',
  latest_chapter_num: 3000,
  latest_chapter_title: 'Chapter 3000',
  chapters_updated_at: '2026-08-01T00:00:00Z',
  site_latest_chapter_time_raw: '2 hours ago',
  site_latest_chapter_time: '2026-08-01T00:00:00Z',
  last_activity: '2026-08-02T10:00:00Z',
  status: 'reading',
  favorite: false,
  rating: 0,
  notes: null,
  started_at: '2026-07-01T00:00:00Z',
  completed_at: null,
  current_read_through: 1,
  read_history: [],
  latest_global: {
    chapter_num: 1204,
    chapter_token: 'chapter',
    percent: 42.5,
    device_id: 'dev-a',
    device_label: 'Desktop',
    url: 'https://novelarrow.com/chapter/martial-peak/chapter-1204-x',
    ts: '2026-08-02T10:00:00Z',
  },
  latest_per_device: {
    'dev-a': {
      chapter_num: 1204,
      chapter_token: 'chapter',
      percent: 42.5,
      device_label: 'Desktop',
      url: 'https://novelarrow.com/chapter/martial-peak/chapter-1204-x',
      ts: '2026-08-02T10:00:00Z',
    },
    'dev-b': {
      chapter_num: 1204,
      chapter_token: 'chapter',
      percent: 40,
      device_label: 'Phone',
      url: 'https://novelarrow.com/chapter/martial-peak/chapter-1204-x',
      ts: '2026-08-02T09:00:00Z',
    },
  },
};

describe('normalizeNovel', () => {
  it('flattens latest_global into the fields the pages read', () => {
    const n = normalizeNovel(baseRaw);
    expect(n.latest_chapter).toBe(1204);
    expect(n.latest_percent).toBe(42.5);
    expect(n.latest_url).toContain('chapter-1204');
    expect(n.latest_device_id).toBe('dev-a');
    expect(n.latest_device_label).toBe('Desktop');
    expect(n.latest_read_at).toBe('2026-08-02T10:00:00Z');
  });

  it('maps latest_per_device into devices_reading with device_id and created_at', () => {
    const n = normalizeNovel(baseRaw);
    expect(n.devices_reading).toHaveLength(2);
    const phone = n.devices_reading.find((d) => d.device_id === 'dev-b');
    expect(phone?.device_label).toBe('Phone');
    expect(phone?.created_at).toBe('2026-08-02T09:00:00Z');
  });

  it('survives a novel with no progress at all (null latest_global)', () => {
    const n = normalizeNovel({
      ...baseRaw,
      latest_global: null,
      latest_per_device: null,
    });
    expect(n.latest_chapter).toBeNull();
    expect(n.latest_percent).toBeNull();
    expect(n.latest_read_at).toBeNull();
    expect(n.devices_reading).toEqual([]);
  });

  it('coerces numeric-string percent (pg NUMERIC) to number', () => {
    const n = normalizeNovel({
      ...baseRaw,
      latest_global: {
        ...(baseRaw.latest_global as NonNullable<RawNovel['latest_global']>),
        percent: '42.50' as unknown as number,
      },
    });
    expect(n.latest_percent).toBe(42.5);
  });

  it('passes through meta fields including last_activity and site times', () => {
    const n = normalizeNovel(baseRaw);
    expect(n.status).toBe('reading');
    expect(n.last_activity).toBe('2026-08-02T10:00:00Z');
    expect(n.site_latest_chapter_time).toBe('2026-08-01T00:00:00Z');
    expect(n.current_read_through).toBe(1);
  });
});
