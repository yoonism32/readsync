/**
 * Characterizes MyList.tsx's Refresh All status-label helpers before
 * extracting them into frontend/src/lib/refreshStatus.ts. Pure functions,
 * no DOM — single importer (MyList.tsx).
 */
import { describe, it, expect } from 'vitest';
import { lastRefreshLabel, describeFailure } from '../../frontend/src/lib/refreshStatus.js';

describe('lastRefreshLabel', () => {
  it('reports "never" when there is no prior refresh', () => {
    expect(lastRefreshLabel(null)).toBe('never');
  });

  it('formats an elapsed time under an hour as minutes only', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(lastRefreshLabel(iso)).toBe('5m ago');
  });

  it('formats an elapsed time of an hour or more as hours and minutes', () => {
    const iso = new Date(Date.now() - (2 * 3_600_000 + 15 * 60_000)).toISOString();
    expect(lastRefreshLabel(iso)).toBe('2h 15m ago');
  });
});

describe('describeFailure', () => {
  it('maps a known failure kind to its label', () => {
    expect(describeFailure('popup_blocked')).toBe('popup blocked — allow popups for this site');
  });

  it('appends the HTTP status when one is present', () => {
    expect(describeFailure('api_error:404')).toBe('server rejected the update (HTTP 404)');
  });

  it('falls back to the raw kind when it is not a known label', () => {
    expect(describeFailure('something_new')).toBe('something_new');
  });

  it('falls back to the raw kind plus status when unknown and status is present', () => {
    expect(describeFailure('something_new:500')).toBe('something_new (HTTP 500)');
  });
});
