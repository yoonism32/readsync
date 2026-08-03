/**
 * Command palette fuzzy matcher: subsequence matching with bonuses for
 * exact substrings, prefixes, word boundaries, and consecutive runs.
 */
import { describe, it, expect } from 'vitest';
import { fuzzyScore, rankItems } from '../../frontend/src/lib/fuzzy.js';

describe('fuzzyScore', () => {
  it('matches exact substrings and prefers prefixes', () => {
    const prefix = fuzzyScore('shadow', 'Shadow Slave');
    const middle = fuzzyScore('slave', 'Shadow Slave');
    expect(prefix).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(prefix!).toBeGreaterThan(middle!);
  });

  it('matches subsequences across words (initials)', () => {
    expect(fuzzyScore('ss', 'Shadow Slave')).not.toBeNull();
    expect(fuzzyScore('rotm', 'Reverend of the Mountain')).not.toBeNull();
  });

  it('rejects non-matches', () => {
    expect(fuzzyScore('xyz', 'Shadow Slave')).toBeNull();
    expect(fuzzyScore('slaves', 'Shadow Slave')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('SHADOW', 'shadow slave')).not.toBeNull();
  });
});

describe('rankItems', () => {
  const items = ['Shadow Slave', 'Lord of the Mysteries', 'Solo Leveling', 'Super Gene'];

  it('returns everything (capped) for an empty query', () => {
    expect(rankItems('', items, s => s, 3)).toHaveLength(3);
  });

  it('ranks better matches first and drops non-matches', () => {
    const ranked = rankItems('so', items, s => s);
    expect(ranked[0]).toBe('Solo Leveling');
    expect(ranked).not.toContain('Lord of the Mysteries');
    expect(ranked.every(r => fuzzyScore('so', r) != null)).toBe(true);
  });

  it('respects the limit', () => {
    expect(rankItems('s', items, s => s, 2)).toHaveLength(2);
  });
});
