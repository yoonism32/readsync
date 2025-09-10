// ==UserScript==
// @name         ReadSync ++ NovelBin Enhanced Navigation Helper
// @namespace    CustomNamespace
// @version      4.8
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner (top-only), max-progress save, #nbp=xx.x resume links + middle-left discoverable copy button (desktop) + CROSS-DEVICE SYNC + stable device IDs + latest chapter extraction
// @match        https://novelbin.com/b/*/*chapter-*
// @match        https://www.novelbin.com/b/*/*chapter-*
// @match        https://novelbin.me/b/*/*chapter-*
// @match        https://www.novelbin.me/b/*/*chapter-*
// @match        https://novelbin.net/b/*/*chapter-*
// @match        https://www.novelbin.net/b/*/*chapter-*
// @match        https://novelbin.org/b/*/*chapter-*
// @match        https://www.novelbin.org/b/*/*chapter-*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ===== Debug helper (logs only) ===== */
    const LOG_TAG = 'ReadSync';
    const log = (...args) => { try { console.debug(`[${LOG_TAG}]`, ...args); } catch { } };

    /* ===== Settings ===== */
    const STEP = 60;
    const AUTO_PIX = 6;
    const AUTO_MS = 20;
    const PCT_DECIMALS = 1;
    const BADGE_AUTOHIDE_MS = 2500;
    const RESTORE_LIMIT = 90;       // restore if <90%, clear if ≥90
    const BANNER_SHOW_MAX_PCT = 10; // show restore banner only if current scroll ≤ 10%
    const IGNORE_LOW_PCT = 1;       // ignore saving tiny noise at very top
    const QUIET_SYNC = true;        // silent on succesful syncs; still shows errors

    // ReadSync Settings
    // const READSYNC_API_BASE = 'http://localhost:3000/api/v1';
    // const READSYNC_API_BASE = 'http://192.168.0.15:3000/api/v1';
    const READSYNC_API_BASE = 'https://readsync-n7zp.onrender.com/api/v1';
    const READSYNC_API_KEY = 'demo-api-key-12345';
    const READSYNC_DEVICE_ID = generateDeviceId();
    const READSYNC_DEVICE_LABEL = getDeviceLabel();
    const SYNC_DEBOUNCE_MS = 500;   // Wait 0.5s before syncing progress (much faster)
    const COMPARE_CHECK_MS = 2000;   // Check for conflicts every 2s (more frequent)

    log('Script start', { path: location.pathname, href: location.href, deviceId: READSYNC_DEVICE_ID, deviceLabel: READSYNC_DEVICE_LABEL });

    // === iOS fix: robustly find the real scroll container ===
    function findScrollEl() {
        const candidates = [
            document.scrollingElement,
            document.documentElement,
            document.body,
            ...Array.from(document.querySelectorAll('main, article, #content, .content, .reader, [data-scroll], [role="main"]'))
        ].filter(Boolean);

        for (const el of candidates) {
            const sh = el.scrollHeight, ch = el.clientHeight;
            if (sh - ch > 200) return el;
        }
        // Fallback to the tallest scrollable node
        let best = document.scrollingElement || document.documentElement;
        let bestDelta = (best.scrollHeight - best.clientHeight);
        for (const el of document.querySelectorAll('body *')) {
            try {
                const delta = el.scrollHeight - el.clientHeight;
                if (delta > bestDelta + 200) { best = el; bestDelta = delta; }
            } catch { }
        }
        return best;
    }

    let page = findScrollEl();
    const recheckScrollEl = () => { page = findScrollEl(); log('Re-evaluated scroll element', page); };
    window.addEventListener('resize', recheckScrollEl, { passive: true });
    new MutationObserver(() => recheckScrollEl()).observe(document.body, { childList: true, subtree: true });

    /* ========= Normalization helpers ========= */
    function normalizePath(path) {
        return path.replace(/\/c+chapter-/, '/chapter-');
    }
    function normalizeUrl(href) {
        return href.replace(/#.*$/, '').replace(/\/c+chapter-/, '/chapter-');
    }

    const normalizedPath = normalizePath(location.pathname);
    const storeKey = "nb_scrollpos:" + normalizedPath;
    log('Normalization', { raw: location.pathname, normalizedPath, storeKey });

    let syncTimeout = null;
    let compareInterval = null;
    let syncBanner = null;

    /* ========= Latest Chapter Extraction ========= */
    function extractLatestChapterInfo() {
        try {
            // Look for the specific NovelBin structure: div.l-chapter
            const latestChapterElement = document.querySelector('.l-chapter');
            if (latestChapterElement) {
                const chapterLink = latestChapterElement.querySelector('.chapter-title');
                if (chapterLink) {
                    const linkText = chapterLink.textContent.trim();
                    const match = linkText.match(/Chapter\s+(\d+)\s*:\s*(.+)/i);
                    if (match) {
                        log('Found latest chapter via .l-chapter', { num: match[1], title: match[2] });
                        return {
                            latestChapterNum: parseInt(match[1], 10),
                            latestChapterTitle: match[2].trim()
                        };
                    }
                }
            }

            // Fallback: check all chapter links on the page
            const allChapterLinks = document.querySelectorAll('a[href*="chapter-"]');
            let maxChapter = 0;
            let maxChapterTitle = null;

            allChapterLinks.forEach(link => {
                const hrefMatch = link.href.match(/chapter-(\d+)/i);
                if (hrefMatch) {
                    const num = parseInt(hrefMatch[1], 10);
                    if (num > maxChapter) {
                        maxChapter = num;
                        // Try to extract title from link text
                        const textMatch = link.textContent.match(/Chapter\s+\d+\s*:\s*(.+)/i);
                        maxChapterTitle = textMatch ? textMatch[1].trim() : null;
                    }
                }
            });

            if (maxChapter > 0) {
                log('Found latest chapter via fallback', { num: maxChapter, title: maxChapterTitle });
                return {
                    latestChapterNum: maxChapter,
                    latestChapterTitle: maxChapterTitle
                };
            }

            log('No latest chapter info found');
            return { latestChapterNum: null, latestChapterTitle: null };
        } catch (error) {
            log('Error extracting latest chapter info:', error);
            return { latestChapterNum: null, latestChapterTitle: null };
        }
    }

    /* ========= Stable Device ID Generation ========= */
    function generateStableFingerprint() {
        // Create a more stable fingerprint based on browser characteristics
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        const canvasFingerprint = canvas.toDataURL().slice(-50);

        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            !!window.sessionStorage,
            !!window.localStorage,
            !!window.indexedDB,
            typeof (Worker),
            navigator.platform,
            navigator.cookieEnabled,
            canvasFingerprint
        ].join('|');

        // Create a simple hash
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return Math.abs(hash).toString(36).substring(0, 6);
    }

    function generateDeviceId() {
        let deviceId = localStorage.getItem('readsync_device_id');

        if (!deviceId) {
            // Try to get a stable fingerprint first
            const fingerprint = generateStableFingerprint();
            const browserInfo = navigator.userAgent.includes('Chrome') ? 'chrome' :
                navigator.userAgent.includes('Firefox') ? 'firefox' :
                    navigator.userAgent.includes('Safari') ? 'safari' : 'browser';

            // Combine browser + stable fingerprint
            deviceId = `${browserInfo}-${fingerprint}`;

            // Check if this ID already exists for this browser type
            const existingDevices = JSON.parse(localStorage.getItem('readsync_known_devices') || '[]');
            const conflictingDevice = existingDevices.find(d => d.id === deviceId);

            if (conflictingDevice) {
                // Add a small random suffix to avoid collision
                const randomSuffix = Math.random().toString(36).substr(2, 2);
                deviceId = `${deviceId}-${randomSuffix}`;
            }

            localStorage.setItem('readsync_device_id', deviceId);

            // Store this device info
            const deviceInfo = { id: deviceId, created: Date.now(), userAgent: navigator.userAgent };
            existingDevices.push(deviceInfo);
            localStorage.setItem('readsync_known_devices', JSON.stringify(existingDevices.slice(-5))); // Keep last 5

            log('Generated new stable device id', { deviceId, fingerprint, browserInfo });
        } else {
            log('Using existing device id', deviceId);
        }

        return deviceId;
    }

    function getDeviceLabel() {
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const browser = navigator.userAgent.includes('Chrome') ? 'Chrome' :
            navigator.userAgent.includes('Firefox') ? 'Firefox' :
                navigator.userAgent.includes('Safari') ? 'Safari' : 'Browser';
        return isMobile ? `Mobile-${browser}` : `Desktop-${browser}`;
    }

    /* ========= ReadSync API Functions ========= */
    async function syncProgress(percent) {
        log('syncProgress invoked', { percent });
        const chapterInfo = parseChapter(location.pathname);
        log('parseChapter result (syncProgress)', chapterInfo);
        if (!chapterInfo) return;

        // Extract latest chapter info
        const latestChapterInfo = extractLatestChapterInfo();

        const payload = {
            user_key: READSYNC_API_KEY,
            device_id: READSYNC_DEVICE_ID,
            device_label: READSYNC_DEVICE_LABEL,
            novel_url: normalizeUrl(location.href),   // ✅ normalized here
            percent: percent,
            seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
            latest_chapter_num: latestChapterInfo.latestChapterNum,
            latest_chapter_title: latestChapterInfo.latestChapterTitle
        };

        try {
            log('Sending payload', payload);
            const response = await fetch(`${READSYNC_API_BASE}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            log('Fetch response', { status: response.status });
            if (response.ok) {
                const result = await response.json();
                log('Server JSON', result);
                if (result.updated && !QUIET_SYNC) {
                    updateBadgeStatus('📡 Synced');
                }
                return result;
            } else {
                const text = await response.text().catch(() => '');
                log('Non-OK response body', text);
                updateBadgeStatus('⚠️ Sync Error', true);
            }
        } catch (error) {
            console.warn(`[${LOG_TAG}] Failed to sync progress`, error);
            updateBadgeStatus('⚠️ Sync Error', true);
        }
    }

    async function checkForSyncConflict() {
        const novelId = normalizeNovelId(location.href);
        if (!novelId) return;
        log('compare check', { novelId, deviceId: READSYNC_DEVICE_ID });
        try {
            const response = await fetch(
                `${READSYNC_API_BASE}/compare?user_key=${READSYNC_API_KEY}&novel_id=${novelId}&device_id=${READSYNC_DEVICE_ID}`
            );
            log('compare response', { status: response.status });
            if (response.ok) {
                const result = await response.json();
                log('compare JSON', result);
                if (result.should_prompt_jump && result.global_state) {
                    showSyncBanner(result.global_state);
                }
            }
        } catch (error) {
            console.warn(`[${LOG_TAG}] Failed to check for conflicts`, error);
        }
    }

    function normalizeNovelId(url) {
        const match = url.match(/\/b\/([^\/]+)/);
        return match ? `novelbin:${match[1].toLowerCase()}` : null;
    }

    function showSyncBanner(globalState) {
        log('showSyncBanner', globalState);
        if (syncBanner) syncBanner.remove();

        syncBanner = document.createElement('div');
        syncBanner.className = 'nb-sync-banner';
        syncBanner.innerHTML = `
      <div class="sync-content">
        <div class="sync-icon">📱</div>
        <div class="sync-text">
          <strong>${globalState.device_label}</strong> is ahead:<br>
          Chapter ${globalState.chapter_num} at ${globalState.percent.toFixed(1)}%
        </div>
        <div class="sync-actions">
          <button class="sync-btn sync-jump">Jump There</button>
          <button class="sync-btn sync-dismiss">Stay Here</button>
        </div>
      </div>
    `;

        if (!document.querySelector('#sync-banner-styles')) {
            const style = document.createElement('style');
            style.id = 'sync-banner-styles';
            style.textContent = `
        .nb-sync-banner {
          position: fixed;
          top: 60px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          padding: 0;
          border-radius: 12px;
          z-index: 100000;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          animation: syncSlideIn 0.3s ease;
          max-width: 400px;
          width: 90%;
        }
        .sync-content { display:flex; align-items:center; gap:16px; padding:16px 20px; }
        .sync-icon { font-size:1.5rem; flex-shrink:0; }
        .sync-text { flex:1; font-size:.95rem; line-height:1.4; }
        .sync-actions { display:flex; flex-direction:column; gap:8px; }
        .sync-btn { padding:8px 16px; border:none; border-radius:6px; font-size:.85rem; font-weight:500; cursor:pointer; transition:all .2s ease; min-width:80px; }
        .sync-jump { background:rgba(255,255,255,0.9); color:#1d4ed8; }
        .sync-jump:hover { background:#fff; transform:translateY(-1px); }
        .sync-dismiss { background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.3); }
        .sync-dismiss:hover { background:rgba(255,255,255,0.2); }
        @keyframes syncSlideIn { from { transform:translateX(-50%) translateY(-20px); opacity:0; } to { transform:translateX(-50%) translateY(0); opacity:1; } }
        @media (max-width:768px){
          .nb-sync-banner{ top:20px; left:16px; right:16px; transform:none; max-width:none; width:auto; }
          .sync-content{ flex-direction:column; text-align:center; gap:12px; }
          .sync-actions{ flex-direction:row; justify-content:center; }
        }
      `;
            document.head.appendChild(style);
        }

        document.body.appendChild(syncBanner);

        const jumpBtn = syncBanner.querySelector('.sync-jump');
        const dismissBtn = syncBanner.querySelector('.sync-dismiss');

        jumpBtn.onclick = () => {
            const targetUrl = globalState.url;
            const targetPercent = globalState.percent;

            if (targetUrl.includes(`chapter-${globalState.chapter_num}`)) {
                const h = Math.max(1, page.scrollHeight - page.clientHeight);
                page.scrollTop = (targetPercent / 100) * h;
                notify(`Jumped to ${targetPercent.toFixed(1)}%`);
            } else {
                location.href = `${targetUrl}#nbp=${targetPercent.toFixed(1)}`;
            }

            syncBanner.remove();
            syncBanner = null;
        };

        dismissBtn.onclick = () => {
            syncBanner.remove();
            syncBanner = null;
        };

        setTimeout(() => {
            if (syncBanner) { syncBanner.remove(); syncBanner = null; }
        }, 30000);
    }

    let pageLoadTime = Date.now();

    /* ===== Badge + hover-only % pill ===== */
    let nbWrap, nbBadge, nbPill;
    function injectBadge() {
        if (!document.body || document.getElementById('nb-badge-wrap')) return;
        const style = document.createElement('style');
        style.textContent = `
      #nb-badge-wrap{position:fixed;top:8px;right:8px;z-index:100000;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      #nb-badge{background:#1f2937;color:#fff;padding:3px 6px;border-radius:4px;font:12px system-ui,sans-serif;opacity:1;transition:opacity .2s ease}
      #nb-pct{background:#111827;color:#fff;padding:2px 6px;border-radius:999px;font:11px system-ui,sans-serif;opacity:0;transition:opacity .2s ease;border:1px solid rgba(255,255,255,.12)}
      #nb-badge-wrap:hover #nb-badge{opacity:1}
      #nb-badge-wrap:hover #nb-pct{opacity:1}
      #nb-badge.nb-hidden{opacity:0}
      #nb-badge-wrap::after{content:"";position:absolute;top:-6px;right:-6px;bottom:-6px;left:-6px}
      .nb-restore{position:fixed;top:40px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:6px 12px;border-radius:6px;font:14px system-ui,sans-serif;z-index:100000;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
      .nb-restore:hover{background:#374151}
      /* ---- Middle-left discoverable controls (desktop, dot only) ---- */
      #nb-hotspot{position:fixed;left:0;top:50%;transform:translateY(-50%);width:40px;height:80px;z-index:99999;cursor:pointer;background:transparent}
      #nb-hotspot:hover{background:transparent}
      #nb-hint-dot{position:fixed;left:18px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:999px;background:#10b981;box-shadow:0 0 0 0 rgba(16,185,129,.05);animation:nb-pulse 1.3s ease-out 3;z-index:100000;opacity:.9;pointer-events:none}
      @keyframes nb-pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.25);opacity:1}60%{box-shadow:0 0 0 6px rgba(16,185,129,0);opacity:.6}100%{box-shadow:0 0 0 0 rgba(16,185,129,0);opacity:.9}}
      #nb-resume-btn{position:fixed;left:16px;top:50%;transform:translateY(-50%);z-index:100001;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.25);padding:8px 12px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:all .2s ease;cursor:pointer;white-space:nowrap}
      #nb-resume-btn.show{opacity:1;pointer-events:auto;transform:translateY(-50%) translateX(8px)}
      #nb-resume-btn:hover{background:#1f2937;border-color:rgba(255,255,255,.35);transform:translateY(-50%) translateX(12px)}
    `;
        document.head.appendChild(style);

        nbWrap = document.createElement('div');
        nbWrap.id = 'nb-badge-wrap';

        nbBadge = document.createElement('div');
        nbBadge.id = 'nb-badge';
        nbBadge.textContent = 'READSYNC OK';

        nbPill = document.createElement('div');
        nbPill.id = 'nb-pct';
        nbPill.textContent = '';

        nbWrap.append(nbBadge, nbPill);
        document.body.appendChild(nbWrap);
        setTimeout(() => nbBadge.classList.add('nb-hidden'), BADGE_AUTOHIDE_MS);

        injectDiscoverableResumeButton();
        log('Badge injected');
    }

    function updateBadgeStatus(text, isError = false) {
        if (!nbBadge) return
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

    /* ========= Notifier ========= */
    function notify(msg) {
        const n = document.createElement('div');
        n.textContent = msg;
        Object.assign(n.style, {
            position: 'fixed', bottom: '10px', right: '10px', background: '#333', color: '#fff',
            padding: '10px 12px', borderRadius: '6px', fontSize: '14px',
            boxShadow: '0 2px 10px rgba(0,0,0,.25)', zIndex: '10000'
        });
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 1500);
    }

    /* ========= Helpers ========= */
    const pctNow = () => {
        const h = Math.max(1, page.scrollHeight - page.clientHeight);
        const frac = page.scrollTop / h;
        return Math.max(0, Math.min(100, frac * 100));
    };

    const debouncedSync = (percent) => {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            log('debouncedSync fire', { percent });
            syncProgress(percent);
        }, SYNC_DEBOUNCE_MS);
    };

    // ========= Apply resume from URL hash (#nbp=xx.x) =========
    function applyHashResume() {
        const m = location.hash && location.hash.match(/nbp=([\d.]+)/i);
        if (!m) return;
        const p = Math.max(0, Math.min(100, parseFloat(m[1])));
        const h = Math.max(1, page.scrollHeight - page.clientHeight);
        page.scrollTop = (p / 100) * h;
        setTimeout(() => { page.scrollTop = (p / 100) * h; }, 500);
        log('applyHashResume', { p });
    }

    // Parse current chapter token (any number of "c"s before "chapter"), number
    function parseChapter(pathname) {
        const m = pathname.match(
            /\/b\/[^/]+\/((c*)chapter)-(\d+)(?:-\3)?(?:-[^/]*)?\/?$/i
        );
        if (!m) { log('parseChapter no match', { pathname }); return null; }
        const res = { token: m[1], num: parseInt(m[3], 10) };
        return res;
    }

    // Build next/prev path preserving token and slug
    function buildChapterPath(pathname, token, newNum) {
        return pathname.replace(/(\/b\/[^/]+\/)(c?chapter)-\d+(?:-\d+)?/i, (_, p1) => {
            return `${p1}${token}-${newNum}`;
        });
    }

    /* ========= Restore banner ========= */
    let restored = false;
    let restoreBtn = null;

    function showRestoreButton(saved) {
        if (restoreBtn) restoreBtn.remove();
        restoreBtn = document.createElement('div');
        restoreBtn.className = 'nb-restore';
        restoreBtn.textContent = `Restore scroll position (${saved.toFixed(PCT_DECIMALS)}%) ↓`;
        restoreBtn.onclick = () => {
            const h = Math.max(1, page.scrollHeight - page.clientHeight);
            restored = true;
            page.scrollTop = (saved / 100) * h;
            restoreBtn.remove();
            restoreBtn = null;
        };
        document.body.appendChild(restoreBtn);
        log('showRestoreButton', { saved });
    }

    function maybeShowRestore() {
        const saved = parseFloat(localStorage.getItem(storeKey) || "0");
        log('maybeShowRestore', { saved, storeKey });
        if (saved > 0 && saved < RESTORE_LIMIT) {
            if (pctNow() <= BANNER_SHOW_MAX_PCT) showRestoreButton(saved);
            const onScrollHide = () => {
                if (pctNow() > BANNER_SHOW_MAX_PCT) {
                    if (restoreBtn) { restoreBtn.remove(); restoreBtn = null; }
                    removeEventListener('scroll', onScrollHide);
                }
            };
            addEventListener('scroll', onScrollHide, { passive: true });
        } else if (saved >= RESTORE_LIMIT) {
            localStorage.removeItem(storeKey);
        }
    }

    /* ========= Progress bar & max-progress save ========= */
    function addProgressBar() {
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            position: 'fixed', top: '0', left: '0', height: '4px', background: '#ff4500',
            zIndex: '10000', width: '0%'
        });
        document.body.appendChild(bar);

        const first = pctNow();
        bar.style.width = `${first}%`;
        if (nbPill) nbPill.textContent = `${first.toFixed(PCT_DECIMALS)}%`;
        log('progress bar init', { first });

        // iOS fix: always register an early heartbeat (even at 0%)
        setTimeout(() => { log('early heartbeat', { first }); syncProgress(first); }, 800);

        function onAnyScroll() {
            const current = pctNow();
            bar.style.width = `${current}%`;
            if (nbPill) nbPill.textContent = `${current.toFixed(PCT_DECIMALS)}%`;

            if (restored) { restored = false; return; }

            const prev = parseFloat(localStorage.getItem(storeKey) || "0");

            if (current >= RESTORE_LIMIT) {
                localStorage.removeItem(storeKey);
            } else {
                const candidate = Math.max(prev || 0, current);
                if (candidate > IGNORE_LOW_PCT && candidate > (prev || 0)) {
                    localStorage.setItem(storeKey, candidate.toFixed(2));
                    debouncedSync(candidate);
                }
            }

            if (Math.abs(current - prev) > 5) {
                log('big scroll delta, syncing', { prev, current });
                debouncedSync(current);
            }
        }

        addEventListener('scroll', onAnyScroll, { passive: true });
        page.addEventListener('scroll', onAnyScroll, { passive: true });
        log('scroll listeners attached');
    }

    /* ========= Auto-scroll ========= */
    let autoOn = false, autoTimer = null;
    function toggleAuto() {
        if (autoOn) { clearInterval(autoTimer); autoOn = false; notify('Auto-Scroll Disabled'); log('auto-scroll off'); }
        else {
            autoTimer = setInterval(() => scrollBy(0, AUTO_PIX), AUTO_MS);
            autoOn = true; notify('Auto-Scroll Enabled'); log('auto-scroll on');
        }
    }

    /* ========= Navigation ========= */
    function navigate(direction) {
        let link = document.querySelector(direction === 'next'
            ? 'a[rel="next"],link[rel="next"]'
            : 'a[rel="prev"],link[rel="prev"]');
        if (!link) {
            const rx = direction === 'next' ? /(next|›|»)/i : /(prev|previous|‹|«)/i;
            link = [...document.querySelectorAll('a,button')].find(el => rx.test((el.textContent || '').trim()));
        }
        if (!link) {
            const info = parseChapter(location.pathname);
            if (info) {
                let n = info.num + (direction === 'next' ? 1 : -1);
                if (n >= 1) {
                    const newPath = buildChapterPath(location.pathname, info.token, n);
                    location.href = newPath;
                    return;
                }
            }
        }
        if (link && link.href) location.href = link.href;
        else notify('No further chapters available.');
    }

    /* ========= Help overlay ========= */
    let overlay;
    function createHelp() {
        overlay = document.createElement('div');
        overlay.innerHTML = `
      <div style="position:fixed;top:10%;left:10%;background:#333;color:#fff;padding:20px;border-radius:8px;z-index:10000;max-width:480px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial">
        <h2 style="margin:0 0 8px;font-size:18px">📚 ReadSync + Keyboard Shortcuts</h2>
        <ul style="line-height:1.7;margin:0;padding-left:18px">
          <li><b>A</b> / <b>←</b> — Previous Chapter</li>
          <li><b>D</b> / <b>→</b> — Next Chapter</li>
          <li><b>W</b> — Scroll Up</li>
          <li><b>S</b> — Scroll Down</li>
          <li><b>Shift+S</b> — Toggle Auto-Scroll</li>
          <li><b>Shift+H</b> — Show/Hide Help</li>
          <li><b>Ctrl+Shift+X</b> — Copy resume link</li>
        </ul>
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #555">
          <h3 style="margin:0 0 8px;font-size:14px;color:#10b981">🔄 ReadSync Features</h3>
          <ul style="line-height:1.6;margin:0;padding-left:18px;font-size:13px;opacity:0.9">
            <li>📱 Cross-device progress sync</li>
            <li>🆔 Stable device IDs (${READSYNC_DEVICE_ID})</li>
            <li>⚡ Auto-conflict detection</li>
            <li>🔗 Resume links with #nbp=xx.x</li>
            <li>📊 Dashboard at <a href="https://readsync-n7zp.onrender.com/" target="_blank" style="color:#10b981">ReadSync Dashboard</a></li>
          </ul>
        </div>
        <div style="margin-top:12px;padding-top:8px;border-top:1px solid #555;font-size:13px;opacity:0.8">
          💡 Hover the left edge to reveal the copy button.
        </div>
      </div>`;
        document.body.appendChild(overlay);
        log('help overlay created');
    }
    function toggleHelp() {
        if (overlay) { overlay.remove(); overlay = null; localStorage.setItem('nb_overlay', 'false'); log('help overlay hidden'); }
        else { createHelp(); localStorage.setItem('nb_overlay', 'true'); }
    }

    /* ========= Middle-left discoverable resume button (desktop) ========= */
    function injectDiscoverableResumeButton() {
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
        let showTimer = null;
        let hideTimer = null;

        const showButton = () => {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            if (!isShowing) {
                isShowing = true;
                btn.classList.add('show');
                hint.style.opacity = '0.3';
            }
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
            const p = pctNow();
            const clean = location.href.replace(/#.*$/, '');
            const url = `${clean}#nbp=${p.toFixed(PCT_DECIMALS)}`;
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    notify(`Copied resume link (${p.toFixed(PCT_DECIMALS)}%)`);
                    log('resume link copied', { url });
                } else {
                    prompt('Copy resume link:', url);
                }
            } catch {
                prompt('Copy resume link:', url);
            }
            hideButton();
        });
        log('discoverable button injected');
    }

    /* ========= Boot ========= */
    function boot() {
        log('boot()');
        injectBadge();
        applyHashResume();
        maybeShowRestore();
        addProgressBar();

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const overlayPref = localStorage.getItem('nb_overlay');
        log('env', { isIOS, overlayPref });

        if (!isIOS && overlayPref !== 'false') {
            createHelp();
        } else if (isIOS && overlayPref === 'true') {
            createHelp();
        }

        setTimeout(() => {
            checkForSyncConflict();
            compareInterval = setInterval(checkForSyncConflict, COMPARE_CHECK_MS);
            log('conflict checker started', { intervalMs: COMPARE_CHECK_MS });
        }, 1000);
    }
    if (document.readyState === 'loading') {
        addEventListener('DOMContentLoaded', boot, { once: true });
    } else boot();

    /* ========= Cleanup ========= */
    window.addEventListener('beforeunload', () => {
        if (syncTimeout) clearTimeout(syncTimeout);
        if (compareInterval) clearInterval(compareInterval);
        log('beforeunload cleanup');
    });

    // iOS-friendly final save
    function sendFinal(percent) {
        try {
            const chapterInfo = parseChapter(location.pathname);
            if (!chapterInfo) { log('sendFinal aborted - no chapter'); return; }
            const latestChapterInfo = extractLatestChapterInfo();
            const payload = {
                user_key: READSYNC_API_KEY,
                device_id: READSYNC_DEVICE_ID,
                device_label: READSYNC_DEVICE_LABEL,
                novel_url: normalizeUrl(location.href),   // ✅ normalized here too
                percent: percent,
                seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
                latest_chapter_num: latestChapterInfo.latestChapterNum,
                latest_chapter_title: latestChapterInfo.latestChapterTitle
            };
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            if (navigator.sendBeacon) {
                const ok = navigator.sendBeacon(`${READSYNC_API_BASE}/progress`, blob);
                log('sendBeacon', { ok, percent });
            } else {
                log('sendBeacon not available');
            }
        } catch (e) {
            log('sendFinal error', e);
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { log('visibilitychange -> hidden'); sendFinal(pctNow()); }
    });
    window.addEventListener('pagehide', () => { log('pagehide'); sendFinal(pctNow()); });

    /* ========= Keys ========= */
    document.onkeydown = function (e) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

        if (e.key.toLowerCase() === 'x' && e.ctrlKey && e.shiftKey) {
            const p = pctNow();
            const clean = location.href.replace(/#.*$/, '');
            const url = `${clean}#nbp=${p.toFixed(PCT_DECIMALS)}`;
            (async () => {
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url);
                        notify(`Copied resume link (${p.toFixed(PCT_DECIMALS)}%)`);
                        log('resume link hotkey copied', { url });
                    } else {
                        prompt('Copy resume link:', url);
                    }
                } catch {
                    prompt('Copy resume link:', url);
                }
            })();
            return;
        }

        switch (e.keyCode) {
            case 65: case 37: navigate('previous'); break;
            case 68: case 39: navigate('next'); break;
            case 87: scrollBy(0, -STEP); break;
            case 83: if (e.shiftKey) toggleAuto(); else scrollBy(0, STEP); break;
            case 72: if (e.shiftKey) toggleHelp(); break;
        }
    };
})();