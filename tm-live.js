// ==UserScript==
// @name         ReadSync ++ NovelBin Enhanced Navigation Helper
// @namespace    CustomNamespace
// @version      5.0.4
// @description  A/D nav, W/S scroll, Shift+S autoscroll, Shift+H help, progress bar, hover % pill, restore banner (top-only), max-progress save, #nbp=xx.x resume links + middle-left discoverable copy button (desktop) + CROSS-DEVICE SYNC + stable device IDs + ROBUST CONTENT-BASED CHAPTER DETECTION + FLEXIBLE URL FORMAT SUPPORT + NUMBER-PREFIX URL SUPPORT
// @match        https://novelbin.com/b/*/*chapter-*
// @match        https://www.novelbin.com/b/*/*chapter-*
// @match        https://novelbin.me/b/*/*chapter-*
// @match        https://www.novelbin.me/b/*/*chapter-*
// @match        https://novelbin.net/b/*/*chapter-*
// @match        https://www.novelbin.net/b/*/*chapter-*
// @match        https://novelbin.org/b/*/*chapter-*
// @match        https://www.novelbin.org/b/*/*chapter-*
// @match        https://novelbin.com/b/*/*chapter*
// @match        https://www.novelbin.com/b/*/*chapter*
// @match        https://novelbin.me/b/*/*chapter*
// @match        https://www.novelbin.me/b/*/*chapter*
// @match        https://novelbin.net/b/*/*chapter*
// @match        https://www.novelbin.net/b/*/*chapter*
// @match        https://novelbin.org/b/*/*chapter*
// @match        https://www.novelbin.org/b/*/*chapter*
// @match        https://novelbin.com/b/*
// @match        https://www.novelbin.com/b/*
// @match        https://novelbin.me/b/*
// @match        https://www.novelbin.me/b/*
// @match        https://novelbin.net/b/*
// @match        https://www.novelbin.net/b/*
// @match        https://novelbin.org/b/*
// @match        https://www.novelbin.org/b/*
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
    const QUIET_SYNC = true;        // silent on successful syncs; still shows errors

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
        // Handle both /chapter-343 and /chapter343 formats
        return path.replace(/\/c+chapter-?/, '/chapter-');
    }
    function normalizeUrl(href) {
        // Handle both formats in URLs
        return href.replace(/#.*$/, '').replace(/\/c+chapter-?/, '/chapter-');
    }

    const normalizedPath = normalizePath(location.pathname);
    const storeKey = "nb_scrollpos:" + normalizedPath;
    log('Normalization', { raw: location.pathname, normalizedPath, storeKey });

    let syncTimeout = null;
    let compareInterval = null;
    let syncBanner = null;

    /* ========= Enhanced Latest Chapter Extraction ========= */
    function extractLatestChapterInfo() {
        try {
            // Helper: Extract chapter number from various text patterns
            const extractChapterNum = (text) => {
                const patterns = [
                    /Chapter\s+(\d+)/i,
                    /Ch\.?\s*(\d+)/i,
                    /Episode\s+(\d+)/i,
                    /#\s*(\d+)/,                        // "#31" or "# 31"
                    /^\s*(\d+)\s*[-–—:\.]/,            // "31. Title" or "31 - Title"
                    /^\s*(\d+)\s+/,                     // "31 Title"
                    /^\s*#?\s*(\d+)\s*$/
                ];
                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > 0 && num < 10000) return num;
                    }
                }
                return null;
            };

            // Helper: Extract chapter number from URL
            const extractChapterFromUrl = (href) => {
                // Try standard chapter format first
                const chapterMatch = href.match(/chapter-?(\d+)/i);
                if (chapterMatch) return parseInt(chapterMatch[1], 10);

                // Get the last segment of the URL path
                try {
                    const url = new URL(href, location.origin);
                    const lastSegment = url.pathname.split('/').pop() || '';

                    // Try number at start of segment (handles 31-title, 32title, 30next)
                    const numberAtStartMatch = lastSegment.match(/^(\d+)/);
                    if (numberAtStartMatch) {
                        const num = parseInt(numberAtStartMatch[1], 10);
                        if (num > 0 && num < 10000) return num;
                    }

                    // Fallback: any number in segment
                    const anyNumberMatch = lastSegment.match(/(\d+)/);
                    if (anyNumberMatch) {
                        const num = parseInt(anyNumberMatch[1], 10);
                        if (num > 0 && num < 10000) return num;
                    }
                } catch (e) {
                    // If URL parsing fails, try simple regex on href
                    const simpleMatch = href.match(/\/(\d+)[^\/]*\/?$/);
                    if (simpleMatch) {
                        const num = parseInt(simpleMatch[1], 10);
                        if (num > 0 && num < 10000) return num;
                    }
                }

                return null;
            };

            // Look for the specific NovelBin structure: div.l-chapter
            const latestChapterElement = document.querySelector('.l-chapter');
            if (latestChapterElement) {
                const chapterLink = latestChapterElement.querySelector('.chapter-title');
                if (chapterLink) {
                    const linkText = chapterLink.textContent.trim();
                    // Try to extract from text - handle both "Chapter X: Title" and "Chapter X - Title"
                    const textMatch = linkText.match(/Chapter\s+(\d+)\s*[-:]\s*(.+)/i);
                    if (textMatch) {
                        log('Found latest chapter via .l-chapter (text)', { num: textMatch[1], title: textMatch[2] });
                        return {
                            latestChapterNum: parseInt(textMatch[1], 10),
                            latestChapterTitle: textMatch[2].trim()
                        };
                    }
                    // Fallback: try number-prefix pattern in text
                    const numFromText = extractChapterNum(linkText);
                    if (numFromText) {
                        log('Found latest chapter via .l-chapter (number pattern)', { num: numFromText, text: linkText });
                        return {
                            latestChapterNum: numFromText,
                            latestChapterTitle: linkText
                        };
                    }
                    // Fallback: try URL
                    if (chapterLink.href) {
                        const numFromUrl = extractChapterFromUrl(chapterLink.href);
                        if (numFromUrl) {
                            log('Found latest chapter via .l-chapter (URL)', { num: numFromUrl, href: chapterLink.href });
                            return {
                                latestChapterNum: numFromUrl,
                                latestChapterTitle: linkText || null
                            };
                        }
                    }
                }
            }

            // Fallback: check ALL links that could be chapter links (not just ones with "chapter" in href)
            // Get novel slug to identify chapter links
            const pathParts = location.pathname.split('/');
            const novelSlugIndex = pathParts.indexOf('b') + 1;
            const novelSlug = pathParts[novelSlugIndex] || '';

            let maxChapter = 0;
            let maxChapterTitle = null;

            // Strategy 1: Links with "chapter" in href (original approach)
            const chapterLinks = document.querySelectorAll('a[href*="chapter"]');
            chapterLinks.forEach(link => {
                const hrefMatch = link.href.match(/chapter-?(\d+)/i);
                if (hrefMatch) {
                    const num = parseInt(hrefMatch[1], 10);
                    if (num > maxChapter) {
                        maxChapter = num;
                        const textMatch = link.textContent.match(/Chapter\s+\d+\s*:\s*(.+)/i);
                        maxChapterTitle = textMatch ? textMatch[1].trim() : link.textContent.trim();
                    }
                }
            });

            // Strategy 2: Links to same novel (catches number-prefix format)
            if (novelSlug) {
                const novelLinks = document.querySelectorAll(`a[href*="/b/${novelSlug}/"]`);
                novelLinks.forEach(link => {
                    const num = extractChapterFromUrl(link.href);
                    if (num && num > maxChapter) {
                        maxChapter = num;
                        maxChapterTitle = link.textContent.trim() || null;
                    }
                });
            }

            // Strategy 3: Check chapter list containers
            const chapterListSelectors = ['.chapter-list', '.list-chapter', '[class*="chapter-list"]', '.chapters'];
            for (const selector of chapterListSelectors) {
                const container = document.querySelector(selector);
                if (container) {
                    const links = container.querySelectorAll('a');
                    links.forEach(link => {
                        const num = extractChapterFromUrl(link.href) || extractChapterNum(link.textContent);
                        if (num && num > maxChapter) {
                            maxChapter = num;
                            maxChapterTitle = link.textContent.trim() || null;
                        }
                    });
                }
            }

            // 🌍 ENHANCED: If local detection seems limited, fetch from main page
            if (maxChapter === 0 || maxChapter < 500) {
                log('Local detection seems limited, trying main page fetch', { localMax: maxChapter });

                // Get novel main page URL (remove chapter part - handle both formats)
                let novelMainUrl = location.href
                    .replace(/\/c*chapter-?\d+.*$/, '')  // Standard chapter format
                    .replace(/\/\d+[-][^/]*$/, '');       // Number-prefix format

                // Ensure we're at the novel page, not still on chapter page
                if (novelMainUrl === location.href) {
                    // Try extracting base novel URL differently
                    const baseMatch = location.href.match(/(https?:\/\/[^/]+\/b\/[^/]+)\//);
                    if (baseMatch) novelMainUrl = baseMatch[1];
                }

                // Try async fetch (won't block current execution)
                fetch(novelMainUrl)
                    .then(response => response.text())
                    .then(html => {
                        const parser = new DOMParser();
                        const mainPageDoc = parser.parseFromString(html, 'text/html');
                        let mainPageMax = maxChapter;

                        // Check for links with chapter in href
                        mainPageDoc.querySelectorAll('a[href*="chapter"]').forEach(link => {
                            const match = link.href.match(/chapter-?(\d+)/i);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > mainPageMax) mainPageMax = num;
                            }
                        });

                        // Also check for number-prefix format
                        if (novelSlug) {
                            mainPageDoc.querySelectorAll(`a[href*="/b/${novelSlug}/"]`).forEach(link => {
                                const num = extractChapterFromUrl(link.href);
                                if (num && num > mainPageMax) mainPageMax = num;
                            });
                        }

                        if (mainPageMax > maxChapter) {
                            log('🎯 Found real chapter count from main page!', {
                                was: maxChapter,
                                now: mainPageMax,
                                improvement: mainPageMax - maxChapter
                            });
                            window.realChapterCount = mainPageMax;
                        }
                    })
                    .catch(err => log('Main page fetch failed (non-critical)', err));
            }

            // Use enhanced count if available, otherwise fallback
            const finalChapterCount = window.realChapterCount || maxChapter;

            if (finalChapterCount > 0) {
                log('Found latest chapter info', {
                    num: finalChapterCount,
                    title: maxChapterTitle,
                    source: window.realChapterCount ? 'main-page-fetch' : 'local-detection'
                });
                return {
                    latestChapterNum: finalChapterCount,
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

    /* ========= ROBUST CURRENT CHAPTER DETECTION (Content-First) ========= */
    function getCurrentChapterFromContent() {
        try {
            // Helper: Multiple regex patterns for chapter detection (ordered by specificity)
            const chapterPatterns = [
                /Chapter\s+(\d+)/i,                    // "Chapter 31" - most common
                /Ch\.?\s*(\d+)/i,                      // "Ch 31" or "Ch. 31"
                /Episode\s+(\d+)/i,                    // "Episode 31"
                /Part\s+(\d+)/i,                       // "Part 31"
                /#\s*(\d+)/,                           // "#31" or "# 31" anywhere
                /^\s*(\d+)\s*[-–—:\.]/,               // "31 - Title" or "31. Title" at start (allows space after)
                /^\s*(\d+)\s+/,                        // "31 Title" - number at start followed by space
                /^\s*#?\s*(\d+)\s*$/,                  // Just a number like "31" or "#31"
            ];

            // Helper function to try all patterns
            const tryPatterns = (text, source) => {
                for (const pattern of chapterPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const chapterNum = parseInt(match[1], 10);
                        // Sanity check: chapter numbers typically 1-9999
                        if (chapterNum > 0 && chapterNum < 10000) {
                            log(`✅ Found current chapter from ${source}`, { text: text.substring(0, 100), chapterNum, pattern: pattern.toString() });
                            return {
                                num: chapterNum,
                                token: 'chapter',
                                title: text,
                                source: source
                            };
                        }
                    }
                }
                return null;
            };

            // Strategy 1: Page title (most reliable based on your test)
            const title = document.title;
            const titleResult = tryPatterns(title, 'title');
            if (titleResult) return titleResult;

            // Strategy 2: Chapter-related elements (your test showed [class*="title"] works)
            const chapterSelectors = [
                '[class*="title"]',
                '.chapter-title',
                '.title',
                '.chapter-header',
                '.chapter-name',
                '[class*="chapter"]'
            ];

            for (const selector of chapterSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent.trim();
                    if (text.length > 1 && text.length < 200) { // Skip empty or huge text blocks
                        const result = tryPatterns(text, `content(${selector})`);
                        if (result) return result;
                    }
                }
            }

            // Strategy 3: H1 headers
            const h1Elements = document.querySelectorAll('h1');
            for (const h1 of h1Elements) {
                const text = h1.textContent.trim();
                const result = tryPatterns(text, 'h1');
                if (result) return result;
            }

            // Strategy 4: Breadcrumbs (your test showed this works too)
            const breadcrumbs = document.querySelectorAll('.breadcrumb, [class*="breadcrumb"], .navigation, .nav');
            for (const crumb of breadcrumbs) {
                const text = crumb.textContent.trim();
                const result = tryPatterns(text, 'breadcrumb');
                if (result) return result;
            }

            // Strategy 5: Look for any element with just a number that could be chapter indicator
            const headerElements = document.querySelectorAll('h1, h2, h3, .header, [class*="header"]');
            for (const header of headerElements) {
                // Check direct text content (not nested)
                const directText = Array.from(header.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim())
                    .join(' ')
                    .trim();
                if (directText) {
                    const result = tryPatterns(directText, 'header-direct');
                    if (result) return result;
                }
            }

            log('❌ No current chapter found in content');
            return null;
        } catch (error) {
            log('Error extracting current chapter from content:', error);
            return null;
        }
    }

    // Enhanced parseChapter that prioritizes content over URL
    function parseChapterEnhanced(pathname) {
        // First try to get chapter from page content
        const contentChapter = getCurrentChapterFromContent();
        if (contentChapter) {
            log('🎯 Using chapter from content:', contentChapter);
            return contentChapter;
        }

        // Fallback to URL parsing with multiple strategies
        log('⚠️ Falling back to URL parsing for chapter detection');

        // Strategy 1: Standard chapter format (chapter-31, cchapter31, etc.)
        const standardMatch = pathname.match(/\/b\/[^/]+\/((c*)chapter)-?(\d+)(?:-[^/]*)?\/?$/i);
        if (standardMatch) {
            const res = {
                token: standardMatch[1],
                num: parseInt(standardMatch[3], 10),
                source: 'url-standard'
            };
            log('🔗 Using chapter from URL (standard format):', res);
            return res;
        }

        // Strategy 2: Number-prefix format - number at START of last segment
        // Matches: /31-title, /32title, /30next (number at beginning, with or without separator)
        const lastSegment = pathname.split('/').pop() || '';
        const numberAtStartMatch = lastSegment.match(/^(\d+)/);
        if (numberAtStartMatch) {
            const num = parseInt(numberAtStartMatch[1], 10);
            // Sanity check: must be reasonable chapter number (1-9999)
            if (num > 0 && num < 10000) {
                const res = {
                    token: 'chapter',
                    num: num,
                    source: 'url-number-prefix'
                };
                log('🔗 Using chapter from URL (number-prefix format):', res);
                return res;
            }
        }

        // Strategy 3: Any number anywhere in the last URL segment (fallback)
        const anyNumberMatch = lastSegment.match(/(\d+)/);
        if (anyNumberMatch) {
            const num = parseInt(anyNumberMatch[1], 10);
            if (num > 0 && num < 10000) {
                const res = {
                    token: 'chapter',
                    num: num,
                    source: 'url-any-number'
                };
                log('🔗 Using chapter from URL (extracted number):', res);
                return res;
            }
        }

        log('❌ parseChapter no match', { pathname });
        return null;
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

    /* ========= Auto-Update Novel Info to Server ========= */
    async function autoUpdateNovelInfo() {
        try {
            // Only run on novel main pages (not chapter pages)
            // Check for standard chapter format OR number-prefix format
            const pathname = location.pathname;
            const lastSegment = pathname.split('/').pop() || '';

            // Skip if: has "chapter" in URL, OR last segment starts with a number (chapter page)
            if (pathname.match(/chapter-?\d+/i) || /^\d+/.test(lastSegment)) {
                log('Skipping auto-update on chapter page', { pathname, lastSegment });
                return;
            }

            const novelId = normalizeNovelId(location.href);
            if (!novelId) {
                log('No novel ID found for auto-update');
                return;
            }

            log('🔄 Auto-updating novel info for:', novelId);

            // Extract latest chapter info from page
            const latestChapterInfo = extractLatestChapterInfo();

            if (!latestChapterInfo.latestChapterNum) {
                log('⚠️ No chapter info found to update');
                return;
            }

            // Get additional info from page
            const genres = extractGenres();
            const author = extractAuthor();
            const updateTime = extractUpdateTime();

            const payload = {
                novel_id: novelId,
                chapter_num: latestChapterInfo.latestChapterNum,
                chapter_title: latestChapterInfo.latestChapterTitle,
                genres: genres,
                author: author,
                update_time_raw: updateTime
            };

            log('📤 Sending novel info:', payload);

            const response = await fetch(`${READSYNC_API_BASE}/admin/novels/auto-update?user_key=${READSYNC_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                log('✅ Novel info auto-updated successfully!', result);
                showAutoUpdateNotification('✅ Chapter info updated!', 'success');
            } else {
                const error = await response.text();
                log('❌ Auto-update failed:', response.status, error);
                if (response.status !== 404) { // Don't show error for novels not in your list
                    showAutoUpdateNotification('⚠️ Update failed', 'error');
                }
            }
        } catch (error) {
            console.warn(`[${LOG_TAG}] Auto-update error:`, error);
            // Silent fail - don't annoy user
        }
    }

    /* ========= Helper: Extract genres from page ========= */
    function extractGenres() {
        try {
            // Try meta tag first
            const metaGenre = document.querySelector('meta[property="og:novel:genre"]');
            if (metaGenre) {
                return metaGenre.getAttribute('content');
            }

            // Try looking for genre labels
            const genreElements = document.querySelectorAll('[class*="genre"], [class*="tag"], .categories');
            if (genreElements.length > 0) {
                const genres = Array.from(genreElements)
                    .map(el => el.textContent.trim())
                    .filter(text => text.length > 0 && text.length < 50)
                    .slice(0, 10) // Max 10 genres
                    .join(', ');
                if (genres) return genres;
            }

            return null;
        } catch (error) {
            log('Error extracting genres:', error);
            return null;
        }
    }

    /* ========= Helper: Extract author from page ========= */
    function extractAuthor() {
        try {
            // Try meta tag first
            const metaAuthor = document.querySelector('meta[property="og:novel:author"]');
            if (metaAuthor) {
                return metaAuthor.getAttribute('content');
            }

            // Try looking for author label
            const authorSelectors = [
                '[class*="author"]',
                '.by-line',
                '[itemprop="author"]'
            ];

            for (const selector of authorSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const text = element.textContent.trim();
                    // Clean up "Author: Name" to just "Name"
                    const cleaned = text.replace(/^Author:\s*/i, '').trim();
                    if (cleaned.length > 0 && cleaned.length < 100) {
                        return cleaned;
                    }
                }
            }

            return null;
        } catch (error) {
            log('Error extracting author:', error);
            return null;
        }
    }

    /* ========= Helper: Extract update time from page ========= */
    function extractUpdateTime() {
        try {
            // Look for time indicators
            const timeSelectors = [
                '.item-time',
                '[class*="update"]',
                '[class*="time"]',
                'time'
            ];

            for (const selector of timeSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const text = element.textContent.trim();
                    // Check if it looks like a time string
                    if (text.match(/ago|hour|day|minute|week|month|year|\d{4}/i)) {
                        return text;
                    }
                }
            }

            return null;
        } catch (error) {
            log('Error extracting update time:', error);
            return null;
        }
    }

    /* ========= Show notification for auto-update ========= */
    function showAutoUpdateNotification(message, type) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        z-index: 100001;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
    `;

        const style = document.createElement('style');
        style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /* ========= ReadSync API Functions ========= */
    async function syncProgress(percent) {
        // Skip progress sync on main pages (only sync on actual chapter pages)
        // A chapter page has either "chapter" in URL OR a number-prefix format
        const pathname = location.pathname;
        const lastSegment = pathname.split('/').pop() || '';
        const isChapterPage = pathname.match(/chapter-?\d+/i) || /^\d+/.test(lastSegment);

        if (!isChapterPage) {
            log('Skipping progress sync on main page', { pathname, lastSegment });
            return;
        }

        log('syncProgress invoked', { percent });
        const chapterInfo = parseChapterEnhanced(location.pathname);
        log('parseChapterEnhanced result (syncProgress)', chapterInfo);
        if (!chapterInfo) return;

        // Extract latest chapter info
        const latestChapterInfo = extractLatestChapterInfo();

        // Show improvement if enhanced detection worked
        if (window.realChapterCount && latestChapterInfo.latestChapterNum === window.realChapterCount) {
            updateBadgeStatus('📈 Enhanced Count', false);
        }

        // Show content-based detection success
        if (chapterInfo.source === 'title' || chapterInfo.source === 'content') {
            updateBadgeStatus('🎯 Smart Detection', false);
        }

        const payload = {
            user_key: READSYNC_API_KEY,
            device_id: READSYNC_DEVICE_ID,
            device_label: READSYNC_DEVICE_LABEL,
            novel_url: normalizeUrl(location.href),
            percent: percent,
            seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
            latest_chapter_num: latestChapterInfo.latestChapterNum,
            latest_chapter_title: latestChapterInfo.latestChapterTitle,
            current_chapter_num: chapterInfo.num,
            current_chapter_source: chapterInfo.source
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

            if (targetUrl.includes(`chapter${globalState.chapter_num}`) || targetUrl.includes(`chapter-${globalState.chapter_num}`)) {
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
    // FIXED: Now handles both /chapter-343 and /chapter344 formats
    function parseChapter(pathname) {
        const m = pathname.match(
            /\/b\/[^/]+\/((c*)chapter)-?(\d+)(?:-[^/]*)?\/?$/i
        );
        if (!m) { log('parseChapter no match', { pathname }); return null; }
        const res = { token: m[1], num: parseInt(m[3], 10) };
        return res;
    }

    // Build next/prev path preserving token and slug
    function buildChapterPath(pathname, token, newNum) {
        // Try to preserve the original format (with or without hyphen after chapter)
        const hasHyphen = pathname.match(/chapter-\d+/i);
        const separator = hasHyphen ? '-' : '';

        return pathname.replace(
            /(\/b\/[^/]+\/)(c*chapter)-?\d+(?:-[^/]*)?/i,
            (_, p1, chapToken) => `${p1}${chapToken}${separator}${newNum}`
        );
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

    /* ========= Enhanced Navigation ========= */
    function navigate(direction) {
        // Stage 1: Prefer NovelBin's built-in navigation IDs
        let link = document.querySelector(direction === 'next' ? '#next_chap' : '#prev_chap');

        // Stage 2: Fallback to rel="next"/"prev"
        if (!link) {
            link = document.querySelector(direction === 'next'
                ? 'a[rel="next"],link[rel="next"]'
                : 'a[rel="prev"],link[rel="prev"]');
        }

        // Stage 3: Fallback to textual buttons (Next / Prev)
        if (!link) {
            const rx = direction === 'next' ? /(next|›|»)/i : /(prev|previous|‹|«)/i;
            link = [...document.querySelectorAll('a,button')].find(el =>
                rx.test((el.textContent || '').trim())
            );
        }

        // Stage 4: If still nothing, build numeric URL
        if (!link) {
            const info = parseChapterEnhanced(location.pathname);
            if (info) {
                const n = info.num + (direction === 'next' ? 1 : -1);
                if (n >= 1) {
                    const newPath = buildChapterPath(location.pathname, info.token, n);
                    console.log(`🧭 Fallback build ${direction}: ${newPath}`);
                    location.href = newPath;
                    return;
                }
            }
        }

        // Stage 5: Navigate using found link
        if (link && link.href) {
            console.log(`🧭 Using ${direction} link:`, link.href);
            location.href = link.href;
        } else {
            notify('No further chapters available.');
        }
    }

    /* ========= Help overlay ========= */
    let overlay;
    function createHelp() {
        overlay = document.createElement('div');
        overlay.innerHTML = `
      <div style="position:fixed;top:10%;left:10%;background:#333;color:#fff;padding:20px;border-radius:8px;z-index:10000;max-width:520px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial">
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
            <li>🎯 Smart chapter detection (content-based)</li>
            <li>🔧 Flexible URL format support</li>
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

    /* ========= Application initialization and platform detection ========= */
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
            const chapterInfo = parseChapterEnhanced(location.pathname);
            if (!chapterInfo) { log('sendFinal aborted - no chapter'); return; }
            const latestChapterInfo = extractLatestChapterInfo();
            const payload = {
                user_key: READSYNC_API_KEY,
                device_id: READSYNC_DEVICE_ID,
                device_label: READSYNC_DEVICE_LABEL,
                novel_url: normalizeUrl(location.href),
                percent: percent,
                seconds_on_page: Math.floor((Date.now() - pageLoadTime) / 1000),
                latest_chapter_num: latestChapterInfo.latestChapterNum,
                latest_chapter_title: latestChapterInfo.latestChapterTitle,
                current_chapter_num: chapterInfo.num,
                current_chapter_source: chapterInfo.source
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

    /* ========= Trigger auto-update on page load ========= */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(autoUpdateNovelInfo, 2000);
        });
    } else {
        setTimeout(autoUpdateNovelInfo, 2000);
    }
})();