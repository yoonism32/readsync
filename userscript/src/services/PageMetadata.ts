const LOG_TAG = 'ReadSync';
const log = (...args: unknown[]) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { /* */ } };

/* ===== Page metadata extraction ===== */

export function extractGenres(): string | null {
  try {
    const metaGenre = document.querySelector<HTMLMetaElement>('meta[property="og:novel:genre"], meta[name="og:novel:genre"]');
    if (metaGenre) return metaGenre.getAttribute('content');

    const genreElements = document.querySelectorAll('[class*="genre"], [class*="tag"], .categories');
    if (genreElements.length > 0) {
      const genres = Array.from(genreElements)
        .map(el => el.textContent?.trim() ?? '')
        .filter(text => text.length > 0 && text.length < 50)
        .slice(0, 10)
        .join(', ');
      if (genres) return genres;
    }
    return null;
  } catch (error) {
    log('Error extracting genres:', error);
    return null;
  }
}

export function extractAuthor(): string | null {
  try {
    const metaAuthor = document.querySelector<HTMLMetaElement>('meta[property="og:novel:author"], meta[name="og:novel:author"]');
    if (metaAuthor) return metaAuthor.getAttribute('content');

    const authorSelectors = ['[class*="author"]', '.by-line', '[itemprop="author"]'];
    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() ?? '';
        const cleaned = text.replace(/^Author:\s*/i, '').trim();
        if (cleaned.length > 0 && cleaned.length < 100) return cleaned;
      }
    }
    return null;
  } catch (error) {
    log('Error extracting author:', error);
    return null;
  }
}

export function extractCoverUrl(): string | null {
  try {
    // og:image on the novel page is the exact cover URL — the server can't
    // reliably guess CDN paths (and its own fetches get bot-filtered).
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="og:image"]',
    );
    const url = meta?.getAttribute('content')?.trim() ?? '';
    return /^https:\/\/[^/]*\/.+/.test(url) ? url : null;
  } catch (error) {
    log('Error extracting cover URL:', error);
    return null;
  }
}

const MAX_SYNOPSIS_LENGTH = 20_000; // ponytail: guessed ceiling, revisit if a real synopsis exceeds it
const SYNOPSIS_EXPANSION_TIMEOUT_MS = 2_000;
const SYNOPSIS_EXPANSION_POLL_MS = 50;

function cleanSynopsisText(text: string | null | undefined): string {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
}

function readSynopsisContainer(container: Element | null | undefined): string | null {
  if (!container) return null;

  const paragraphs = Array.from(container.querySelectorAll('p'))
    .map(paragraph => cleanSynopsisText(paragraph.textContent))
    .filter(Boolean);
  const text = paragraphs.length > 0
    ? paragraphs.join('\n\n')
    : cleanSynopsisText(container.textContent);

  return text.length > 0 && text.length <= MAX_SYNOPSIS_LENGTH ? text : null;
}

async function waitForSynopsisExpansion(panel: Element, initialParagraphCount: number): Promise<boolean> {
  const deadline = Date.now() + SYNOPSIS_EXPANSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const paragraphCount = panel.querySelectorAll('.site-reading-prose p').length;
    if (paragraphCount > initialParagraphCount) return true;
    await new Promise(resolve => setTimeout(resolve, SYNOPSIS_EXPANSION_POLL_MS));
  }
  return false;
}

export async function extractSynopsis(): Promise<string | null> {
  try {
    // Not og:description — NovelArrow truncates it (docs/ROADMAP.md
    // "Novel metadata"). NovelArrow initially renders only part of longer
    // synopses, so expand the button scoped to the Synopsis panel before
    // reading its paragraphs. Scoping avoids comment "Show more" controls.
    const synopsisHeading = Array.from(document.querySelectorAll('span'))
      .find(element => element.textContent?.trim() === 'Synopsis');
    const panel = synopsisHeading?.closest('.site-panel');
    const modernContainer = panel?.querySelector('.site-reading-prose');

    if (panel && modernContainer) {
      const initialParagraphCount = modernContainer.querySelectorAll('p').length;
      const showMore = Array.from(panel.querySelectorAll('button'))
        .find(button => button.textContent?.trim() === 'Show more');
      if (showMore) {
        (showMore as HTMLButtonElement).click();
        const expanded = await waitForSynopsisExpansion(panel, initialParagraphCount);
        // Never permanently store the truncated preview if expansion failed.
        // Returning null leaves this novel eligible for a later retry.
        if (!expanded) return null;
      }
      return readSynopsisContainer(modernContainer);
    }

    // Legacy NovelArrow/NovelBin fallbacks.
    const dtEls = Array.from(document.querySelectorAll('dt'));
    const synopsisDt = dtEls.find(dt => /^synopsis:?$/i.test(dt.textContent?.trim() ?? ''));
    const dd = synopsisDt?.nextElementSibling;
    const container =
      dd && dd.tagName === 'DD' ? dd : document.querySelector('[class*="synopsis"]');
    return readSynopsisContainer(container);
  } catch (error) {
    log('Error extracting synopsis:', error);
    return null;
  }
}

export function extractUpdateTime(): string | null {
  try {
    // NovelArrow serves an ISO timestamp in the og:novel:update_time meta
    const metaTime = document.querySelector<HTMLMetaElement>(
      'meta[name="og:novel:update_time"], meta[property="og:novel:update_time"]',
    );
    const metaContent = metaTime?.getAttribute('content')?.trim();
    if (metaContent) return metaContent;

    const timeSelectors = ['.item-time', '[class*="update"]', '[class*="time"]', 'time'];
    for (const selector of timeSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() ?? '';
        if (/ago|hour|day|minute|week|month|year|\d{4}/i.test(text)) return text;
      }
    }
    return null;
  } catch (error) {
    log('Error extracting update time:', error);
    return null;
  }
}
