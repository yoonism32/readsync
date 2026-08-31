// ReadSync chapter-detection console debugger.
//
// Mirrors the regex logic in userscript/src/services/ChapterDetector.ts
// (isChapterPath + the NovelArrow/NovelBin branches of parseChapterEnhanced)
// so you can see which rule matched a URL and what chapter number it
// resolved to, without rebuilding/redeploying the userscript.
//
// Not imported anywhere — paste directly into DevTools console. Standalone
// mirror, not a live import: if ChapterDetector.ts's regexes change,
// re-copy them here to keep this in sync.
//
// Usage:
//   readsyncDebugChapter()                          // current page
//   readsyncDebugChapter('https://novelarrow.com/chapter/slug/chapter-auto-282-auto-282-145-title')

function readsyncDebugChapter(input) {
  const href = input || location.href;
  const pathname = new URL(href).pathname;
  const parts = pathname.split('/').filter(Boolean);
  const lastSeg = parts[parts.length - 1] || '';
  const out = { url: href, pathname };

  // isChapterPath
  out.isChapterPath = parts.length > 2 &&
    !!(pathname.match(/chapter-?(?:auto-\d+-)*\d+/i) || /^\d+/.test(lastSeg));

  // NovelArrow ground-truth match (auto-<N> wins over trailing digits)
  const arrow = pathname.match(/\/chapter\/[^/]+\/chapter-?(?:auto-(\d+)|(\d+))(?:-[^/]*)?\/?$/i);
  if (arrow) {
    out.matchedRule = arrow[1] !== undefined ? 'novelarrow: auto-<N> (real chapter)' : 'novelarrow: plain chapter-N';
    out.chapterNum = parseInt(arrow[1] ?? arrow[2], 10);
    out.source = 'url-novelarrow';
  } else {
    out.matchedRule = 'no NovelArrow /chapter/<slug>/chapter-... match';
    // fallback chain, only meaningful if you're debugging a non-NovelArrow URL
    const std = pathname.match(/\/b\/[^/]+\/((c*)chapter)-?(\d+)(?:-[^/]*)?\/?$/i);
    const pre = lastSeg.match(/^(\d+)/);
    const any = lastSeg.match(/(\d+)/);
    if (std) { out.matchedRule = 'novelbin: standard chapter-N'; out.chapterNum = +std[3]; out.source = 'url-standard'; }
    else if (pre) { out.matchedRule = 'number-prefix fallback'; out.chapterNum = +pre[1]; out.source = 'url-number-prefix'; }
    else if (any) { out.matchedRule = 'any-number fallback (weak)'; out.chapterNum = +any[1]; out.source = 'url-any-number'; }
    else { out.chapterNum = null; out.source = null; }
  }

  console.table(out);
  return out;
}
readsyncDebugChapter(); // or readsyncDebugChapter('https://...')
