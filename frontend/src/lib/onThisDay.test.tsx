import { describe, it, expect } from 'vitest';
import { agoLabel, chapterLabel } from './onThisDay.js';

describe('OnThisDay labels', () => {
  it('names the common anchors in words, not month counts', () => {
    expect(agoLabel(1)).toBe('A month ago');
    expect(agoLabel(12)).toBe('A year ago');
    expect(agoLabel(24)).toBe('Two years ago');
  });

  it('falls back to a month count for the rest', () => {
    expect(agoLabel(3)).toBe('3 months ago');
    expect(agoLabel(6)).toBe('6 months ago');
  });

  // A single-chapter day should not read as a range of one.
  it('collapses a one-chapter span', () => {
    expect(chapterLabel(7, 7)).toBe('Ch. 7');
    expect(chapterLabel(230, 233)).toBe('Ch. 230–233');
  });
});
