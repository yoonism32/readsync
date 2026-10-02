/**
 * NovelPing keeps hidden audio-player buttons labelled "Next chapter" /
 * "Previous chapter" (0×0, class listen-btn) that main.ts's aria-label stage
 * matched before the real a.js-chapter-nav anchors, so A/D clicked the audio
 * player instead of changing page. The disabled ends of the chain are
 * <a href="javascript:void(0)">. Verified live 2026-10-02.
 */
import { describe, it, expect } from 'vitest';
import {
  findAriaChapterButton,
  findChapterNavAnchor,
  isRenderedElement,
} from '../../userscript/src/services/NavLinks.js';

const button = (opts: { disabled?: boolean; width?: number; height?: number }) => ({
  hasAttribute: (n: string) => n === 'disabled' && !!opts.disabled,
  getBoundingClientRect: () => ({ width: opts.width ?? 40, height: opts.height ?? 40 }),
});

describe('findAriaChapterButton — picks the first USABLE match, not just the first', () => {
  const rootOf = (buttons: ReturnType<typeof button>[]) => ({
    querySelectorAll: (sel: string) => (sel.includes('Next chapter') ? buttons : []),
  });

  it('skips a hidden or disabled earlier match and returns the visible one', () => {
    const hidden = button({ width: 0, height: 0 });
    const disabled = button({ disabled: true });
    const visible = button({});
    expect(findAriaChapterButton(rootOf([hidden, disabled, visible]), 'next')).toBe(visible);
  });

  it('returns null when every match is hidden or disabled, or none exist', () => {
    expect(findAriaChapterButton(rootOf([button({ width: 0, height: 0 })]), 'next')).toBeNull();
    expect(findAriaChapterButton(rootOf([]), 'next')).toBeNull();
  });
});

describe('findChapterNavAnchor — root-relative hrefs', () => {
  it('accepts a root-relative reader link but still rejects javascript: and bare #', () => {
    const rel = { textContent: 'Next Chapter', getAttribute: () => '/novel/x/chapter-3' };
    const dead = { textContent: 'Next Chapter', getAttribute: () => 'javascript:void(0)' };
    const hash = { textContent: 'Next Chapter', getAttribute: () => '#' };
    const rootOf = (as: (typeof rel)[]) => ({ querySelectorAll: () => as });
    expect(findChapterNavAnchor(rootOf([rel]), 'next')).toBe(rel);
    expect(findChapterNavAnchor(rootOf([dead, hash]), 'next')).toBeNull();
  });
});

const anchor = (text: string, href: string) => ({
  textContent: text,
  getAttribute: (n: string) => (n === 'href' ? href : null),
});

const root = (anchors: ReturnType<typeof anchor>[]) => ({
  querySelectorAll: (sel: string) => (sel === 'a.js-chapter-nav' ? anchors : []),
});

describe('findChapterNavAnchor', () => {
  const prev = anchor('Prev Chapter', 'https://novelping.com/book/x/chapter-1');
  const next = anchor('Next Chapter', 'https://novelping.com/book/x/chapter-3-title');

  it('finds the next and previous anchors by label', () => {
    expect(findChapterNavAnchor(root([prev, next]), 'next')).toBe(next);
    expect(findChapterNavAnchor(root([prev, next]), 'previous')).toBe(prev);
  });

  it('ignores the disabled end of the chain (javascript:void(0))', () => {
    const deadPrev = anchor('Prev Chapter', 'javascript:void(0)');
    expect(findChapterNavAnchor(root([deadPrev, next]), 'previous')).toBeNull();
    expect(findChapterNavAnchor(root([deadPrev, next]), 'next')).toBe(next);
  });

  it('returns null on sites without these anchors', () => {
    expect(findChapterNavAnchor(root([]), 'next')).toBeNull();
  });
});

describe('isRenderedElement', () => {
  const withRect = (width: number, height: number) => ({ getBoundingClientRect: () => ({ width, height }) });

  it('is false for the 0×0 hidden audio-player button', () => {
    expect(isRenderedElement(withRect(0, 0))).toBe(false);
  });

  it('is true for a visible control', () => {
    expect(isRenderedElement(withRect(120, 36))).toBe(true);
  });
});
