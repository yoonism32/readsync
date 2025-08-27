// ==UserScript==
// @name         ReadSync ++ NovelBin Enhanced Navigation Helper
// @namespace    CustomNamespace
// @version      4.1
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner, resume links + cross-device sync via ReadSync
// @match        https://novelbin.com/b/*/
// @match        https://novelbin.com/b/*/*
// @match        https://novelbin.com/b/*/chapter-*
// @match        https://novelbin.com/b/*/cchapter-*
// @match        https://www.novelbin.com/b/*/chapter-*
// @match        https://www.novelbin.com/b/*/cchapter-*
// @match        https://novelbin.me/b/*/chapter-*
// @match        https://novelbin.me/b/*/cchapter-*
// @match        https://www.novelbin.me/b/*/chapter-*
// @match        https://www.novelbin.me/b/*/cchapter-*
// @match        https://novelbin.net/b/*/chapter-*
// @match        https://novelbin.net/b/*/cchapter-*
// @match        https://www.novelbin.net/b/*/chapter-*
// @match        https://www.novelbin.net/b/*/cchapter-*
// @match        https://novelbin.org/b/*/chapter-*
// @match        https://novelbin.org/b/*/cchapter-*
// @match        https://www.novelbin.org/b/*/chapter-*
// @match        https://www.novelbin.org/b/*/cchapter-*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ===== Base Settings ===== */
    const STEP = 60;
    const AUTO_PIX = 12;
    const AUTO_MS = 20;
    const PCT_DECIMALS = 1;
    const BADGE_AUTOHIDE_MS = 2500;
    const RESTORE_LIMIT = 90;
    const BANNER_SHOW_MAX_PCT = 10;
    const IGNORE_LOW_PCT = 1;

    /* ===== ReadSync Settings ===== */
    const READSYNC_API_BASE = 'https://zesty-exploration-readsync.up.railway.app/api/v1';
    const READSYNC_API_KEY = 'demo-api-key-12345';
    const READSYNC_DEVICE_ID = getOrCreateDeviceId();
    const READSYNC_DEVICE_LABEL = getDeviceLabel();
    const SYNC_DEBOUNCE_MS = 3000;
    const COMPARE_CHECK_MS = 8000;

    let syncTimeout = null;
    let compareInterval = null;
    let syncBanner = null;
    let pageLoadTime = Date.now();

    const page = document.scrollingElement || document.documentElement;
    const normalizedPath = location.pathname.replace('/cchapter-', '/chapter-');
    const storeKey = "nb_scrollpos:" + normalizedPath;

    /* ===== Device ID & Label ===== */
    function getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('readsync_device_id');
        if (!deviceId) {
            const browser = /Chrome/.test(navigator.userAgent) ? 'chrome'
                : /Firefox/.test(navigator.userAgent) ? 'firefox'
                    : /Safari/.test(navigator.userAgent) ? 'safari'
                        : 'browser';
            deviceId = `${browser}-${Math.random().toString(36).substr(2, 6)}`;
            localStorage.setItem('readsync_device_id', deviceId);
        }
        return deviceId;
    }
    function getDeviceLabel() {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const browser = /Chrome/.test(navigator.userAgent) ? 'Chrome'
            : /Firefox/.test(navigator.userAgent) ? 'Firefox'
                : /Safari/.test(navigator.userAgent) ? 'Safari'
                    : 'Browser';
        return isMobile ? `Mobile-${browser}` : `Desktop-${browser}`;
    }

    /* ===== API ===== */
    async function syncProgress(percent) {
        const chapterInfo = parseChapter(location.pathname);
        if (!chapterInfo) return;

        const payload = {
            user_key: READSYNC_API_KEY,
            device_id: READSYNC_DEVICE_ID,
            device_label: READSYNC_DEVICE_LABEL,
            novel_url: location.href.replace(/#.*$/, ''),
            percent,
            seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
        };

        try {
            const resp = await fetch(`${READSYNC_API_BASE}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (resp.ok) {
                const result = await resp.json();
                if (result.updated) updateBadgeStatus('📡 Synced');
                return result;
            }
        } catch (e) {
            console.warn('ReadSync sync failed', e);
            updateBadgeStatus('⚠️ Sync Error', true);
        }
    }

    async function checkForSyncConflict() {
        const novelId = normalizeNovelId(location.href);
        if (!novelId) return;

        try {
            const resp = await fetch(
                `${READSYNC_API_BASE}/compare?user_key=${READSYNC_API_KEY}&novel_id=${novelId}&device_id=${READSYNC_DEVICE_ID}`
            );
            if (resp.ok) {
                const result = await resp.json();
                if (result.should_prompt_jump && result.global_state) {
                    showSyncBanner(result.global_state);
                }
            }
        } catch (e) {
            console.warn('ReadSync compare failed', e);
        }
    }

    function normalizeNovelId(url) {
        const m = url.match(/\/b\/([^/]+)/);
        return m ? `novelbin:${m[1].toLowerCase()}` : null;
    }

    /* ===== Sync Banner ===== */
    function showSyncBanner(globalState) {
        if (syncBanner) syncBanner.remove();
        syncBanner = document.createElement('div');
        syncBanner.className = 'nb-sync-banner';
        syncBanner.innerHTML = `
      <div class="sync-content">
        <div class="sync-icon">📱</div>
        <div class="sync-text"><strong>${globalState.device_label}</strong> is ahead:<br>
        Chapter ${globalState.chapter_num} at ${globalState.percent.toFixed(1)}%</div>
        <div class="sync-actions">
          <button class="sync-btn sync-jump">Jump</button>
          <button class="sync-btn sync-dismiss">Stay</button>
        </div>
      </div>`;
        if (!document.querySelector('#sync-banner-styles')) {
            const style = document.createElement('style');
            style.id = 'sync-banner-styles';
            style.textContent = `
        .nb-sync-banner{position:fixed;top:60px;left:50%;transform:translateX(-50%);
          background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border-radius:12px;
          z-index:100000;box-shadow:0 8px 32px rgba(0,0,0,.3);max-width:400px;width:90%}
        .sync-content{display:flex;align-items:center;gap:16px;padding:14px 20px}
        .sync-icon{font-size:1.5rem}
        .sync-text{flex:1;font-size:.95rem}
        .sync-actions{display:flex;gap:8px}
        .sync-btn{padding:6px 12px;border:none;border-radius:6px;font-size:.85rem;cursor:pointer}
        .sync-jump{background:#fff;color:#1d4ed8}.sync-dismiss{background:rgba(255,255,255,.2);color:#fff}
      `;
            document.head.appendChild(style);
        }
        document.body.appendChild(syncBanner);

        syncBanner.querySelector('.sync-jump').onclick = () => {
            const targetUrl = globalState.url;
            const p = globalState.percent;
            if (targetUrl.includes(`chapter-${globalState.chapter_num}`)) {
                const h = Math.max(1, page.scrollHeight - innerHeight);
                page.scrollTop = (p / 100) * h;
                notify(`Jumped to ${p.toFixed(1)}%`);
            } else {
                location.href = `${targetUrl}#nbp=${p.toFixed(1)}`;
            }
            syncBanner.remove();
        };
        syncBanner.querySelector('.sync-dismiss').onclick = () => syncBanner.remove();
        setTimeout(() => syncBanner && syncBanner.remove(), 25000);
    }

    /* ===== Badge & Progress ===== */
    let nbBadge, nbPill;
    function injectBadge() {
        if (document.getElementById('nb-badge-wrap')) return;
        const style = document.createElement('style');
        style.textContent = `
      #nb-badge-wrap{position:fixed;top:8px;right:8px;z-index:100000;display:flex;flex-direction:column;gap:6px}
      #nb-badge{background:#1f2937;color:#fff;padding:3px 6px;border-radius:4px;font:12px system-ui}
      #nb-pct{background:#111827;color:#fff;padding:2px 6px;border-radius:999px;font:11px system-ui;opacity:0;transition:opacity .2s}
      #nb-badge-wrap:hover #nb-pct{opacity:1}
    `;
        document.head.appendChild(style);

        const wrap = document.createElement('div');
        wrap.id = 'nb-badge-wrap';
        nbBadge = document.createElement('div'); nbBadge.id = 'nb-badge'; nbBadge.textContent = 'READSYNC OK';
        nbPill = document.createElement('div'); nbPill.id = 'nb-pct';
        wrap.append(nbBadge, nbPill);
        document.body.appendChild(wrap);
    }
    function updateBadgeStatus(text, isError = false) {
        if (!nbBadge) return;
        nbBadge.textContent = text;
        nbBadge.style.background = isError ? '#dc2626' : '#1f2937';
        setTimeout(() => { nbBadge.textContent = 'READSYNC OK'; nbBadge.style.background = '#1f2937'; }, 2000);
    }

    const pctNow = () => {
        const h = Math.max(1, page.scrollHeight - innerHeight);
        return Math.max(0, Math.min(100, (page.scrollTop / h) * 100));
    };
    const debouncedSync = (p) => { clearTimeout(syncTimeout); syncTimeout = setTimeout(() => syncProgress(p), SYNC_DEBOUNCE_MS); };

    function addProgressBar() {
        const bar = document.createElement('div');
        Object.assign(bar.style, { position: 'fixed', top: 0, left: 0, height: '3px', background: '#f97316', zIndex: 10000, width: '0%' });
        document.body.appendChild(bar);

        const update = () => {
            const p = pctNow();
            bar.style.width = `${p}%`;
            if (nbPill) nbPill.textContent = `${p.toFixed(PCT_DECIMALS)}%`;
            if (p > IGNORE_LOW_PCT) debouncedSync(p);
        };
        update(); addEventListener('scroll', update, { passive: true });
    }

    /* ===== Parse & Nav ===== */
    function parseChapter(path) {
        const m = path.match(/\/b\/[^/]+\/(c?chapter)-(\d+)/i);
        return m ? { token: m[1], num: parseInt(m[2]) } : null;
    }
    function buildChapterPath(path, token, n) {
        return path.replace(/(\/b\/[^/]+\/)(c?chapter)-\d+/i, (_, p1) => `${p1}${token}-${n}`);
    }
    function navigate(dir) {
        const info = parseChapter(location.pathname);
        if (!info) return;
        const n = info.num + (dir === 'next' ? 1 : -1);
        if (n < 1) return;
        location.href = buildChapterPath(location.pathname, info.token, n);
    }

    /* ===== Utils ===== */
    function notify(msg) {
        const n = document.createElement('div'); n.textContent = msg;
        Object.assign(n.style, { position: 'fixed', bottom: '10px', right: '10px', background: '#333', color: '#fff', padding: '6px 10px', borderRadius: '4px', zIndex: 10000 });
        document.body.appendChild(n); setTimeout(() => n.remove(), 1500);
    }

    /* ===== Boot ===== */
    function boot() {
        injectBadge(); addProgressBar();
        setTimeout(() => { checkForSyncConflict(); compareInterval = setInterval(checkForSyncConflict, COMPARE_CHECK_MS); }, 2000);
    }
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

    /* ===== Keyboard ===== */
    document.onkeydown = (e) => {
        if (e.target.tagName.match(/INPUT|TEXTAREA/)) return;
        if (e.key === 'a' || e.key === 'ArrowLeft') navigate('prev');
        if (e.key === 'd' || e.key === 'ArrowRight') navigate('next');
        if (e.key === 'w') scrollBy(0, -STEP);
        if (e.key === 's' && !e.shiftKey) scrollBy(0, STEP);
    };
})();
