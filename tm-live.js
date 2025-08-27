// ==UserScript==
// @name         ReadSync ++ NovelBin Enhanced Navigation Helper 
// @namespace    CustomNamespace
// @version      4.0
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner (top-only), max-progress save, #nbp=xx.x resume links + middle-left discoverable copy button (desktop) + CROSS-DEVICE SYNC
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

    /* ===== Settings ===== */
    const STEP = 60;
    const AUTO_PIX = 12;
    const AUTO_MS = 20;
    const PCT_DECIMALS = 1;
    const BADGE_AUTOHIDE_MS = 2500;
    const RESTORE_LIMIT = 90;       // restore if <90%, clear if ≥90
    const BANNER_SHOW_MAX_PCT = 10; // show restore banner only if current scroll ≤ 10%
    const IGNORE_LOW_PCT = 1;       // ignore saving tiny noise at very top

    // ReadSync Settings
    // const READSYNC_API_BASE = 'http://localhost:3000/api/v1';
    const READSYNC_API_BASE = 'http://192.168.0.15:3000/api/v1';
    const READSYNC_API_KEY = 'demo-api-key-12345';
    const READSYNC_DEVICE_ID = generateDeviceId();
    const READSYNC_DEVICE_LABEL = getDeviceLabel();
    const SYNC_DEBOUNCE_MS = 3000;  // Wait 3s before syncing progress
    const COMPARE_CHECK_MS = 5000;   // Check for conflicts every 5s

    const page = document.scrollingElement || document.documentElement;

    // Normalize for storage so /cchapter-XX and /chapter-XX share the same key
    const normalizedPath = location.pathname.replace('/cchapter-', '/chapter-');
    const storeKey = "nb_scrollpos:" + normalizedPath;

    let syncTimeout = null;
    let compareInterval = null;
    let syncBanner = null;

    /* ========= Device ID Generation ========= */
    function generateDeviceId() {
        let deviceId = localStorage.getItem('readsync_device_id');
        if (!deviceId) {
            const browserInfo = navigator.userAgent.includes('Chrome') ? 'chrome' :
                navigator.userAgent.includes('Firefox') ? 'firefox' :
                    navigator.userAgent.includes('Safari') ? 'safari' : 'browser';
            const randomId = Math.random().toString(36).substr(2, 6);
            deviceId = `${browserInfo}-${randomId}`;
            localStorage.setItem('readsync_device_id', deviceId);
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
        const chapterInfo = parseChapter(location.pathname);
        if (!chapterInfo) return;

        const payload = {
            user_key: READSYNC_API_KEY,
            device_id: READSYNC_DEVICE_ID,
            device_label: READSYNC_DEVICE_LABEL,
            novel_url: location.href.replace(/#.*$/, ''),
            percent: percent,
            seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000)
        };

        try {
            const response = await fetch(`${READSYNC_API_BASE}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.updated) {
                    updateBadgeStatus('📡 Synced');
                }
                return result;
            }
        } catch (error) {
            console.warn('ReadSync: Failed to sync progress', error);
            updateBadgeStatus('⚠️ Sync Error', true);
        }
    }

    async function checkForSyncConflict() {
        const novelId = normalizeNovelId(location.href);
        if (!novelId) return;

        try {
            const response = await fetch(`${READSYNC_API_BASE}/compare?user_key=${READSYNC_API_KEY}&novel_id=${novelId}&device_id=${READSYNC_DEVICE_ID}`);

            if (response.ok) {
                const result = await response.json();
                if (result.should_prompt_jump && result.global_state) {
                    showSyncBanner(result.global_state);
                }
            }
        } catch (error) {
            console.warn('ReadSync: Failed to check for conflicts', error);
        }
    }

    function normalizeNovelId(url) {
        const match = url.match(/\/b\/([^\/]+)/);
        return match ? `novelbin:${match[1].toLowerCase()}` : null;
    }

    function showSyncBanner(globalState) {
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

        // Add styles
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

        .sync-content {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
        }

        .sync-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .sync-text {
          flex: 1;
          font-size: 0.95rem;
          line-height: 1.4;
        }

        .sync-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sync-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 80px;
        }

        .sync-jump {
          background: rgba(255, 255, 255, 0.9);
          color: #1d4ed8;
        }

        .sync-jump:hover {
          background: white;
          transform: translateY(-1px);
        }

        .sync-dismiss {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .sync-dismiss:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        @keyframes syncSlideIn {
          from {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .nb-sync-banner {
            top: 20px;
            left: 16px;
            right: 16px;
            transform: none;
            max-width: none;
            width: auto;
          }
          .sync-content {
            flex-direction: column;
            text-align: center;
            gap: 12px;
          }
          .sync-actions {
            flex-direction: row;
            justify-content: center;
          }
        }
      `;
            document.head.appendChild(style);
        }

        document.body.appendChild(syncBanner);

        // Event handlers
        const jumpBtn = syncBanner.querySelector('.sync-jump');
        const dismissBtn = syncBanner.querySelector('.sync-dismiss');

        jumpBtn.onclick = () => {
            // Navigate to the chapter and scroll position
            const targetUrl = globalState.url;
            const targetPercent = globalState.percent;

            if (targetUrl.includes(`chapter-${globalState.chapter_num}`)) {
                // Same chapter, just scroll
                const h = Math.max(1, page.scrollHeight - innerHeight);
                page.scrollTop = (targetPercent / 100) * h;
                notify(`Jumped to ${targetPercent.toFixed(1)}%`);
            } else {
                // Different chapter, navigate with hash
                location.href = `${targetUrl}#nbp=${targetPercent.toFixed(1)}`;
            }

            syncBanner.remove();
            syncBanner = null;
        };

        dismissBtn.onclick = () => {
            syncBanner.remove();
            syncBanner = null;
        };

        // Auto-dismiss after 30 seconds
        setTimeout(() => {
            if (syncBanner) {
                syncBanner.remove();
                syncBanner = null;
            }
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
      #nb-hotspot {
        position: fixed;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 40px;
        height: 80px;
        z-index: 99999;
        cursor: pointer;
        background: transparent;
      }
      #nb-hotspot:hover { background: transparent; }

      #nb-hint-dot {
        position: fixed;
        left: 18px;
        top: 50%;
        transform: translateY(-50%);
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #10b981;
        box-shadow: 0 0 0 0 rgba(16,185,129,.05);
        animation: nb-pulse 1.3s ease-out 3;
        z-index: 100000;
        opacity: .9;
        pointer-events: none;
      }
      @keyframes nb-pulse {
        0% { box-shadow: 0 0 0 0 rgba(16,185,129,.25); opacity: 1; }
        60% { box-shadow: 0 0 0 6px rgba(16,185,129,0); opacity: .6; }
        100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); opacity: .9; }
      }
      #nb-resume-btn{
        position:fixed;left:16px;top:50%;transform:translateY(-50%);
        z-index:100001;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.25);
        padding:8px 12px;border-radius:8px;font:13px system-ui,sans-serif;
        box-shadow:0 6px 20px rgba(0,0,0,.4);
        opacity:0;pointer-events:none;transition:all .2s ease;cursor:pointer;white-space:nowrap;
      }
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

        // desktop discoverable copy button
        injectDiscoverableResumeButton();
    }

    function updateBadgeStatus(text, isError = false) {
        if (nbBadge) {
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
        const h = Math.max(1, page.scrollHeight - innerHeight);
        const frac = page.scrollTop / h;
        return Math.max(0, Math.min(100, frac * 100));
    };

    // Debounced sync function
    const debouncedSync = (percent) => {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            syncProgress(percent);
        }, SYNC_DEBOUNCE_MS);
    };

    // ========= Apply resume from URL hash (#nbp=xx.x) =========
    function applyHashResume() {
        const m = location.hash && location.hash.match(/nbp=([\d.]+)/i);
        if (!m) return;
        const p = Math.max(0, Math.min(100, parseFloat(m[1])));
        const h = Math.max(1, page.scrollHeight - innerHeight);
        page.scrollTop = (p / 100) * h;
        setTimeout(() => { page.scrollTop = (p / 100) * h; }, 500);
    }

    // Parse current chapter token ("chapter" or "cchapter"), number
    function parseChapter(pathname) {
        const m = pathname.match(/\/b\/[^/]+\/(c?chapter)-(\d+)(?:-\2)?(?:-[^/]*)?\/?$/i);
        if (!m) return null;
        return { token: m[1], num: parseInt(m[2], 10) };
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
            const h = Math.max(1, page.scrollHeight - innerHeight);
            restored = true;
            page.scrollTop = (saved / 100) * h;
            restoreBtn.remove();
            restoreBtn = null;
        };
        document.body.appendChild(restoreBtn);
    }

    function maybeShowRestore() {
        const saved = parseFloat(localStorage.getItem(storeKey) || "0");
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

        // Sync initial progress
        if (first > IGNORE_LOW_PCT) {
            debouncedSync(first);
        }

        addEventListener('scroll', () => {
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
                    // Sync to cloud
                    debouncedSync(candidate);
                }
            }
        }, { passive: true });
    }

    /* ========= Auto-scroll ========= */
    let autoOn = false, autoTimer = null;
    function toggleAuto() {
        if (autoOn) { clearInterval(autoTimer); autoOn = false; notify('Auto-Scroll Disabled'); }
        else {
            autoTimer = setInterval(() => scrollBy(0, AUTO_PIX), AUTO_MS);
            autoOn = true; notify('Auto-Scroll Enabled');
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
          <li><b>A</b> / <b>←</b> – Previous Chapter</li>
          <li><b>D</b> / <b>→</b> – Next Chapter</li>
          <li><b>W</b> – Scroll Up</li>
          <li><b>S</b> – Scroll Down</li>
          <li><b>Shift+S</b> – Toggle Auto-Scroll</li>
          <li><b>Shift+H</b> – Show/Hide Help</li>
          <li><b>Ctrl+Shift+X</b> – Copy resume link</li>
        </ul>
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #555">
          <h3 style="margin:0 0 8px;font-size:14px;color:#10b981">🔄 ReadSync Features</h3>
          <ul style="line-height:1.6;margin:0;padding-left:18px;font-size:13px;opacity:0.9">
            <li>📱 Cross-device progress sync</li>
            <li>⚡ Auto-conflict detection</li>
            <li>🔗 Resume links with #nbp=xx.x</li>
            <li>📊 Dashboard at <a href="http://localhost:3000" target="_blank" style="color:#10b981">localhost:3000</a></li>
          </ul>
        </div>
        <div style="margin-top:12px;padding-top:8px;border-top:1px solid #555;font-size:13px;opacity:0.8">
          💡 Hover the left edge to reveal the copy button.
        </div>
      </div>`;
        document.body.appendChild(overlay);
    }
    function toggleHelp() {
        if (overlay) { overlay.remove(); overlay = null; localStorage.setItem('nb_overlay', 'false'); }
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
                } else {
                    prompt('Copy resume link:', url);
                }
            } catch {
                prompt('Copy resume link:', url);
            }
            hideButton();
        });
    }

    /* ========= Boot ========= */
    function boot() {
        injectBadge();
        applyHashResume();   // jump if #nbp=xx.x present
        maybeShowRestore();
        addProgressBar();
        if (localStorage.getItem('nb_overlay') !== 'false') createHelp();

        // Start ReadSync features
        setTimeout(() => {
            checkForSyncConflict();
            // Check for conflicts periodically
            compareInterval = setInterval(checkForSyncConflict, COMPARE_CHECK_MS);
        }, 2000);
    }

    if (document.readyState === 'loading') {
        addEventListener('DOMContentLoaded', boot, { once: true });
    } else boot();

    /* ========= Cleanup ========= */
    window.addEventListener('beforeunload', () => {
        if (syncTimeout) clearTimeout(syncTimeout);
        if (compareInterval) clearInterval(compareInterval);
    });

    /* ========= Keys ========= */
    document.onkeydown = function (e) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

        // Ctrl+Shift+X => copy resume link
        if (e.key.toLowerCase() === 'x' && e.ctrlKey && e.shiftKey) {
            const p = pctNow();
            const clean = location.href.replace(/#.*$/, '');
            const url = `${clean}#nbp=${p.toFixed(PCT_DECIMALS)}`;
            (async () => {
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url);
                        notify(`Copied resume link (${p.toFixed(PCT_DECIMALS)}%)`);
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