// Helpers for main.ts's A/D chapter navigation.
//
// NovelPing keeps hidden audio-player buttons labelled "Next chapter" /
// "Previous chapter" (0×0) that the aria-label stage would otherwise grab
// before the real reader links, and renders the disabled ends of the chain as
// <a href="javascript:void(0)">. Both are skipped here.

interface RectLike {
  getBoundingClientRect(): { width: number; height: number };
}

export function isRenderedElement(el: RectLike): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

interface AnchorLike {
  textContent: string | null;
  getAttribute(name: string): string | null;
}

/**
 * First usable aria-labelled chapter button (NovelArrow's circular controls).
 * Takes the first match that is enabled AND rendered rather than just the first
 * match, so a hidden duplicate (NovelPing's audio player, or a responsive
 * variant) ahead of the real control can't shadow it.
 */
export function findAriaChapterButton<T extends RectLike & { hasAttribute(name: string): boolean }>(
  root: { querySelectorAll(selector: string): ArrayLike<T> },
  direction: 'next' | 'previous',
): T | null {
  const label = direction === 'next' ? 'Next chapter' : 'Previous chapter';
  return (
    Array.from(root.querySelectorAll(`button[aria-label="${label}" i],button[title="${label}" i]`)).find(
      (b) => !b.hasAttribute('disabled') && isRenderedElement(b),
    ) ?? null
  );
}

/** The visible "Next Chapter" / "Prev Chapter" reader link, or null when absent or disabled. */
export function findChapterNavAnchor<T extends AnchorLike>(
  root: { querySelectorAll(selector: string): ArrayLike<T> },
  direction: 'next' | 'previous',
): T | null {
  const label = direction === 'next' ? /^next/i : /^prev/i;
  return (
    Array.from(root.querySelectorAll('a.js-chapter-nav')).find(
      (a) => label.test((a.textContent ?? '').trim()) && /^(?:https?:\/\/|\/)/i.test(a.getAttribute('href') ?? ''),
    ) ?? null
  );
}
