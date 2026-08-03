/**
 * Legacy-style compact relative ages for the MyList table: 12h · 3d · 4mo.
 */
import { describe, it, expect } from 'vitest';
import { compactAge } from '../../frontend/src/pages/MyList.js';

const NOW = new Date('2026-08-03T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('compactAge', () => {
  it('formats minutes, hours, days, months, years', () => {
    expect(compactAge(ago(5 * 60_000), NOW)).toBe('5m');
    expect(compactAge(ago(12 * 3_600_000), NOW)).toBe('12h');
    expect(compactAge(ago(9 * 86_400_000), NOW)).toBe('9d');
    expect(compactAge(ago(65 * 86_400_000), NOW)).toBe('2mo');
    expect(compactAge(ago(400 * 86_400_000), NOW)).toBe('1y');
  });

  it('handles missing and bogus dates', () => {
    expect(compactAge(null, NOW)).toBe('—');
    expect(compactAge(undefined, NOW)).toBe('—');
    expect(compactAge('not-a-date', NOW)).toBe('—');
  });
});
