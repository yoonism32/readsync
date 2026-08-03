import { PCT_DECIMALS, BADGE_AUTOHIDE_MS, RESTORE_LIMIT, BANNER_SHOW_MAX_PCT, QUIET_SYNC } from '../config.js';
import type { GlobalState } from '../types/index.js';

const LOG_TAG = 'ReadSync';
const log = (...args: unknown[]) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { /* */ } };

function injectStyles(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/* ===== Badge ===== */

let nbBadge: HTMLDivElement | null = null;
let nbPill: HTMLDivElement | null = null;

export function injectBadge(deviceId: string): void {
  if (!document.body || document.getElementById('nb-badge-wrap')) return;

  injectStyles('nb-core-styles', `
    #nb-badge-wrap{position:fixed;top:8px;right:8px;z-index:100000;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
    #nb-badge{background:#1f2937;color:#fff;padding:3px 6px;border-radius:4px;font:12px system-ui,sans-serif;opacity:1;transition:opacity .2s ease}
    #nb-pct{background:#111827;color:#fff;padding:2px 6px;border-radius:999px;font:11px system-ui,sans-serif;opacity:0;transition:opacity .2s ease;border:1px solid rgba(255,255,255,.12)}
    #nb-badge-wrap:hover #nb-badge{opacity:1}
    #nb-badge-wrap:hover #nb-pct{opacity:1}
    #nb-badge.nb-hidden{opacity:0}
    #nb-badge-wrap::after{content:"";position:absolute;top:-6px;right:-6px;bottom:-6px;left:-6px}
    .nb-restore{position:fixed;top:40px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:6px 12px;border-radius:6px;font:14px system-ui,sans-serif;z-index:100000;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
    .nb-restore:hover{background:#374151}
    #nb-hotspot{position:fixed;left:0;top:50%;transform:translateY(-50%);width:40px;height:80px;z-index:99999;cursor:pointer;background:transparent}
    #nb-hint-dot{position:fixed;left:18px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:999px;background:#10b981;box-shadow:0 0 0 0 rgba(16,185,129,.05);animation:nb-pulse 1.3s ease-out 3;z-index:100000;opacity:.9;pointer-events:none}
    @keyframes nb-pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.25);opacity:1}60%{box-shadow:0 0 0 6px rgba(16,185,129,0);opacity:.6}100%{box-shadow:0 0 0 0 rgba(16,185,129,0);opacity:.9}}
    #nb-resume-btn{position:fixed;left:16px;top:50%;transform:translateY(-50%);z-index:100001;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.25);padding:8px 12px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:all .2s ease;cursor:pointer;white-space:nowrap}
    #nb-resume-btn.show{opacity:1;pointer-events:auto;transform:translateY(-50%) translateX(8px)}
    #nb-resume-btn:hover{background:#1f2937;border-color:rgba(255,255,255,.35);transform:translateY(-50%) translateX(12px)}
  `);

  const nbWrap = document.createElement('div');
  nbWrap.id = 'nb-badge-wrap';

  nbBadge = document.createElement('div');
  nbBadge.id = 'nb-badge';
  nbBadge.textContent = 'READSYNC OK';

  nbPill = document.createElement('div');
  nbPill.id = 'nb-pct';
  nbPill.textContent = '';

  nbWrap.append(nbBadge, nbPill);
  document.body.appendChild(nbWrap);
  setTimeout(() => nbBadge?.classList.add('nb-hidden'), BADGE_AUTOHIDE_MS);

  injectDiscoverableResumeButton(deviceId);
  log('Badge injected');
}

export function updateBadgeStatus(text: string, isError = false): void {
  if (!nbBadge) return;
  if (QUIET_SYNC && !isError) return;

  nbBadge.textContent = text;
  nbBadge.style.background = isError ? '#dc2626' : '#1f2937';
  nbBadge.classList.remove('nb-hidden');

  setTimeout(() => {
    if (nbBadge) {
      nbBadge.textContent = 'READSYNC OK';
      nbBadge.style.background = '#1f2937';
      nbBadge.classList.add('nb-hidden');
    }
  }, 2000);
}

export function updatePill(percent: number): void {
  if (nbPill) nbPill.textContent = `${percent.toFixed(PCT_DECIMALS)}%`;
}

/* ===== Toast notification ===== */

export function notify(msg: string): void {
  const n = document.createElement('div');
  n.textContent = msg;
  Object.assign(n.style, {
    position: 'fixed', bottom: '10px', right: '10px', background: '#333', color: '#fff',
    padding: '10px 12px', borderRadius: '6px', fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0,0,0,.25)', zIndex: '10000',
  });
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1500);
}

export function showAutoUpdateNotification(message: string, type: 'success' | 'error'): void {
  injectStyles('nb-slide-anim', `
    @keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}
  `);

  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px', 'padding:12px 20px',
    `background:${type === 'success' ? '#10b981' : '#ef4444'}`,
    'color:white', 'border-radius:8px', 'z-index:100001',
    'font-family:system-ui,sans-serif', 'font-size:14px', 'font-weight:500',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)', 'animation:slideInRight 0.3s ease',
  ].join(';');

  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/* ===== Sync conflict banner ===== */

let syncBanner: HTMLElement | null = null;
const dismissedConflicts = new Set<string>();

export function showSyncBanner(globalState: GlobalState): void {
  log('showSyncBanner', globalState);

  const conflictKey = `${globalState.device_id}_${globalState.chapter_num}_${Math.floor(globalState.percent / 5)}`;
  if (dismissedConflicts.has(conflictKey)) {
    log('Conflict already dismissed, skipping banner', { conflictKey });
    return;
  }

  if (syncBanner) syncBanner.remove();

  injectStyles('sync-banner-styles', `
    .nb-sync-banner{position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:0;border-radius:12px;z-index:100000;box-shadow:0 8px 32px rgba(0,0,0,0.3);animation:syncSlideIn 0.3s ease;max-width:400px;width:90%}
    .sync-content{display:flex;align-items:center;gap:16px;padding:16px 20px}
    .sync-icon{font-size:1.5rem;flex-shrink:0}
    .sync-text{flex:1;font-size:.95rem;line-height:1.4}
    .sync-actions{display:flex;flex-direction:column;gap:8px}
    .sync-btn{padding:8px 16px;border:none;border-radius:6px;font-size:.85rem;font-weight:500;cursor:pointer;transition:all .2s ease;min-width:80px}
    .sync-jump{background:rgba(255,255,255,0.9);color:#1d4ed8}
    .sync-jump:hover{background:#fff;transform:translateY(-1px)}
    .sync-dismiss{background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.3)}
    .sync-dismiss:hover{background:rgba(255,255,255,0.2)}
    @keyframes syncSlideIn{from{transform:translateX(-50%) translateY(-20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
    @media(max-width:768px){
      .nb-sync-banner{top:20px;left:16px;right:16px;transform:none;max-width:none;width:auto}
      .sync-content{flex-direction:column;text-align:center;gap:12px}
      .sync-actions{flex-direction:row;justify-content:center}
    }
  `);

  // Build banner DOM without innerHTML
  const banner = document.createElement('div');
  banner.className = 'nb-sync-banner';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'sync-content';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'sync-icon';
  iconDiv.textContent = '📱';

  const textDiv = document.createElement('div');
  textDiv.className = 'sync-text';
  const strong = document.createElement('strong');
  strong.textContent = globalState.device_label;
  textDiv.appendChild(strong);
  textDiv.appendChild(document.createTextNode(` is ahead:\nChapter ${globalState.chapter_num} at ${globalState.percent.toFixed(1)}%`));

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'sync-actions';

  const jumpBtn = document.createElement('button');
  jumpBtn.className = 'sync-btn sync-jump';
  jumpBtn.textContent = 'Jump There';

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'sync-btn sync-dismiss';
  dismissBtn.textContent = 'Stay Here';

  actionsDiv.append(jumpBtn, dismissBtn);
  contentDiv.append(iconDiv, textDiv, actionsDiv);
  banner.appendChild(contentDiv);
  syncBanner = banner;

  document.body.appendChild(syncBanner);

  jumpBtn.onclick = () => {
    dismissedConflicts.add(conflictKey);
    log('Conflict resolved via jump', { conflictKey });

    const targetUrl = globalState.url;
    const targetPercent = globalState.percent;

    if (targetUrl.includes(`chapter${globalState.chapter_num}`) || targetUrl.includes(`chapter-${globalState.chapter_num}`)) {
      const scrollEl = document.scrollingElement ?? document.documentElement;
      const h = Math.max(1, scrollEl.scrollHeight - scrollEl.clientHeight);
      scrollEl.scrollTop = (targetPercent / 100) * h;
      notify(`Jumped to ${targetPercent.toFixed(1)}%`);
    } else {
      location.href = `${targetUrl}#nbp=${targetPercent.toFixed(1)}`;
    }

    syncBanner?.remove();
    syncBanner = null;
  };

  dismissBtn.onclick = () => {
    dismissedConflicts.add(conflictKey);
    log('Conflict dismissed', { conflictKey });
    syncBanner?.remove();
    syncBanner = null;
  };

  setTimeout(() => {
    if (syncBanner) { syncBanner.remove(); syncBanner = null; }
  }, 30000);
}

/* ===== Restore scroll banner ===== */

let restoreBtn: HTMLDivElement | null = null;
let restored = false;

export function isRestored(): boolean { return restored; }
export function clearRestored(): void { restored = false; }

export function showRestoreButton(saved: number, _storeKey: string, getScrollEl: () => Element): void {
  if (restoreBtn) restoreBtn.remove();
  restoreBtn = document.createElement('div');
  restoreBtn.className = 'nb-restore';
  restoreBtn.textContent = `Restore scroll position (${saved.toFixed(PCT_DECIMALS)}%) ↓`;
  restoreBtn.onclick = () => {
    const page = getScrollEl();
    const h = Math.max(1, page.scrollHeight - page.clientHeight);
    restored = true;
    (page as HTMLElement).scrollTop = (saved / 100) * h;
    restoreBtn?.remove();
    restoreBtn = null;
  };
  document.body.appendChild(restoreBtn);
  log('showRestoreButton', { saved });
}

let onScrollHide: (() => void) | null = null;

export function maybeShowRestore(storeKey: string, getScrollEl: () => Element, pctNow: () => number): void {
  // Called once per chapter (including SPA navigations): tear down the
  // previous chapter's banner and hide-listener so they can't accumulate
  // or restore a stale chapter's position.
  if (onScrollHide) { window.removeEventListener('scroll', onScrollHide); onScrollHide = null; }
  if (restoreBtn) { restoreBtn.remove(); restoreBtn = null; }

  const saved = parseFloat(localStorage.getItem(storeKey) ?? '0');
  log('maybeShowRestore', { saved, storeKey });
  if (saved > 0 && saved < RESTORE_LIMIT) {
    if (pctNow() <= BANNER_SHOW_MAX_PCT) showRestoreButton(saved, storeKey, getScrollEl);
    onScrollHide = () => {
      if (pctNow() > BANNER_SHOW_MAX_PCT) {
        if (restoreBtn) { restoreBtn.remove(); restoreBtn = null; }
        if (onScrollHide) { window.removeEventListener('scroll', onScrollHide); onScrollHide = null; }
      }
    };
    window.addEventListener('scroll', onScrollHide, { passive: true });
  } else if (saved >= RESTORE_LIMIT) {
    localStorage.removeItem(storeKey);
  }
}

/* ===== Middle-left discoverable resume button ===== */

function injectDiscoverableResumeButton(_deviceId: string): void {
  const hotspot = document.createElement('div');
  hotspot.id = 'nb-hotspot';

  const hint = document.createElement('div');
  hint.id = 'nb-hint-dot';

  const btn = document.createElement('button');
  btn.id = 'nb-resume-btn';
  btn.type = 'button';
  btn.textContent = 'Copy resume link';

  document.body.append(hotspot, hint, btn);

  let isShowing = false;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const showButton = () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!isShowing) { isShowing = true; btn.classList.add('show'); hint.style.opacity = '0.3'; }
  };
  const hideButton = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (isShowing) {
      hideTimer = setTimeout(() => {
        isShowing = false;
        btn.classList.remove('show');
        hint.style.opacity = '.85';
        hideTimer = null;
      }, 250);
    }
  };

  hotspot.addEventListener('mouseenter', () => { showTimer = setTimeout(showButton, 250); });
  hotspot.addEventListener('mouseleave', hideButton);
  btn.addEventListener('mouseenter', () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } });
  btn.addEventListener('mouseleave', hideButton);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const scrollEl = document.scrollingElement ?? document.documentElement;
    const h = Math.max(1, scrollEl.scrollHeight - scrollEl.clientHeight);
    const p = Math.max(0, Math.min(100, (scrollEl.scrollTop / h) * 100));
    const clean = location.href.replace(/#.*$/, '');
    const url = `${clean}#nbp=${p.toFixed(PCT_DECIMALS)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify(`Copied resume link (${p.toFixed(PCT_DECIMALS)}%)`);
        log('resume link copied', { url });
      } else {
        window.prompt('Copy resume link:', url);
      }
    } catch {
      window.prompt('Copy resume link:', url);
    }
    hideButton();
  });

  log('discoverable button injected');
}

/* ===== Help overlay ===== */

let overlay: HTMLDivElement | null = null;

export function createHelp(deviceId: string): void {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:fixed;top:10%;left:10%;background:#333;color:#fff;padding:20px;border-radius:8px;z-index:10000;max-width:520px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 8px;font-size:18px';
  title.textContent = '📚 ReadSync + Keyboard Shortcuts';

  const shortcuts: [string, string][] = [
    ['A / ←', 'Previous Chapter'],
    ['D / →', 'Next Chapter'],
    ['W', 'Scroll Up'],
    ['S', 'Scroll Down'],
    ['Shift+S', 'Toggle Auto-Scroll'],
    ['Shift+H', 'Show/Hide Help'],
    ['Ctrl+Shift+X', 'Copy resume link'],
  ];
  const ul = document.createElement('ul');
  ul.style.cssText = 'line-height:1.7;margin:0;padding-left:18px';
  shortcuts.forEach(([key, desc]) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = key;
    li.append(b, document.createTextNode(` — ${desc}`));
    ul.appendChild(li);
  });

  const featureSection = document.createElement('div');
  featureSection.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #555';
  const featureTitle = document.createElement('h3');
  featureTitle.style.cssText = 'margin:0 0 8px;font-size:14px;color:#10b981';
  featureTitle.textContent = '🔄 ReadSync Features';
  const features = [
    '📱 Cross-device progress sync',
    `🆔 Stable device IDs (${deviceId})`,
    '⚡ Auto-conflict detection',
    '🔗 Resume links with #nbp=xx.x',
    '🎯 Smart chapter detection (content-based)',
    '🔧 Flexible URL format support',
  ];
  const featureUl = document.createElement('ul');
  featureUl.style.cssText = 'line-height:1.6;margin:0;padding-left:18px;font-size:13px;opacity:0.9';
  features.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    featureUl.appendChild(li);
  });

  const dashLi = document.createElement('li');
  dashLi.textContent = '📊 Dashboard at ';
  const dashLink = document.createElement('a');
  dashLink.href = 'https://readsync-n7zp.onrender.com/';
  dashLink.target = '_blank';
  dashLink.style.color = '#10b981';
  dashLink.textContent = 'ReadSync Dashboard';
  dashLi.appendChild(dashLink);
  featureUl.appendChild(dashLi);

  featureSection.append(featureTitle, featureUl);

  const tip = document.createElement('div');
  tip.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #555;font-size:13px;opacity:0.8';
  tip.textContent = '💡 Hover the left edge to reveal the copy button.';

  outer.append(title, ul, featureSection, tip);

  overlay = document.createElement('div');
  overlay.appendChild(outer);
  document.body.appendChild(overlay);
  log('help overlay created');
}

export function toggleHelp(deviceId: string): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    localStorage.setItem('nb_overlay', 'false');
    log('help overlay hidden');
  } else {
    createHelp(deviceId);
    localStorage.setItem('nb_overlay', 'true');
  }
}
