/**
 * ReadSync Shared Utilities
 * Consolidated functions used across all HTML pages
 */

// API Configuration
const API_BASE = '/api/v1';
const API_KEY_STORAGE_KEY = 'readsync_api_key';

/* ==================== API Key Management ==================== */

/**
 * Get API key from localStorage
 * @returns {string} API key or empty string
 */
function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

/**
 * Set API key in localStorage
 * @param {string} key - API key to store
 */
function setApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

/**
 * Check if API key is set
 * @returns {boolean} True if API key exists
 */
function hasApiKey() {
    return !!getApiKey();
}

/* ==================== API Fetch Helper ==================== */

/**
 * Unified API fetch helper with automatic API key injection and cache busting
 * @param {string} path - API endpoint path (e.g., '/novels')
 * @param {Object} options - Fetch options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.body=null] - Request body (will be JSON stringified)
 * @param {Object} [options.qs={}] - Query string parameters
 * @returns {Promise<Object>} Parsed JSON response
 */
async function getJSON(path, { method = 'GET', body = null, qs = {} } = {}) {
    const key = getApiKey();
    if (!key) {
        throw new Error('API key required. Please authenticate first.');
    }

    // Construct full path with API_BASE
    const fullPath = path.startsWith('/api/v1') ? path :
        path.startsWith('/') ? `${API_BASE}${path}` :
            `${API_BASE}/${path}`;

    const url = new URL(fullPath, location.origin);

    // Add API key to query string
    url.searchParams.set('user_key', key);

    // Cache busting - single consistent approach
    url.searchParams.set('_t', Date.now().toString());

    // Add additional query parameters
    for (const [k, v] of Object.entries(qs)) {
        if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
        }
    }

    const res = await fetch(url.toString(), {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        body: body ? JSON.stringify(body) : null
    });

    if (!res.ok) {
        let detail = '';
        try {
            const j = await res.json();
            detail = j.error || j.detail || JSON.stringify(j);
        } catch {
            detail = await res.text().catch(() => '');
        }
        throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail : ''}`);
    }

    return res.json();
}

/* ==================== Toast Notifications ==================== */

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} [type='success'] - Toast type: 'success', 'error', 'warning', 'info'
 * @param {number} [duration=1800] - Duration in milliseconds
 */
function toast(message, type = 'success', duration = 1800) {
    const colors = {
        success: 'rgba(16, 185, 129, 0.95)', // green
        error: 'rgba(239, 68, 68, 0.95)',    // red
        warning: 'rgba(245, 158, 11, 0.95)',  // orange
        info: 'rgba(59, 130, 246, 0.95)'     // blue
    };

    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `
        position: fixed; 
        bottom: 100px; 
        right: 24px;
        background: ${colors[type] || colors.success}; 
        color: white;
        padding: 12px 16px; 
        border-radius: 8px; 
        font-weight: 500;
        z-index: 10000; 
        box-shadow: 0 4px 12px rgba(0,0,0,.15);
        animation: slideIn 0.3s ease-out;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    if (!document.getElementById('toast-animations')) {
        style.id = 'toast-animations';
        document.head.appendChild(style);
    }

    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => el.remove(), 300);
    }, duration);
}

/* ==================== Error Display ==================== */

/**
 * Show error message in error element or as toast
 * @param {string} message - Error message
 * @param {string|HTMLElement} [target='error'] - Element ID or element to show error in
 * @param {number} [timeout=5000] - Timeout in milliseconds
 */
function showError(message, target = 'error', timeout = 5000) {
    let el;
    if (typeof target === 'string') {
        el = document.getElementById(target);
    } else if (target instanceof HTMLElement) {
        el = target;
    }

    if (el) {
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => {
            el.style.display = 'none';
        }, timeout);
    } else {
        // Fallback to toast if element not found
        toast(message, 'error', 3000);
    }
}

/* ==================== Resume Link Copying ==================== */

/**
 * Copy resume link to clipboard
 * @param {string} url - Base URL (chapter URL)
 * @param {number} percent - Progress percentage (0-100)
 * @returns {Promise<void>}
 */
async function copyResumeLink(url, percent) {
    if (!url) {
        showError('No URL provided');
        return;
    }

    const clean = (url || '').replace(/#.*$/, '');
    const resume = `${clean}#nbp=${Number(percent || 0).toFixed(1)}`;

    try {
        await navigator.clipboard.writeText(resume);
        toast(`Copied resume link (${Number(percent || 0).toFixed(1)}%)`);
    } catch (err) {
        // Fallback for older browsers
        try {
            const t = document.createElement('textarea');
            t.value = resume;
            t.style.position = 'fixed';
            t.style.opacity = '0';
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            document.body.removeChild(t);
            toast(`Copied resume link (${Number(percent || 0).toFixed(1)}%)`);
        } catch (fallbackErr) {
            // Last resort: show prompt
            prompt('Copy this link:', resume);
            showError('Failed to copy to clipboard');
        }
    }
}

/* ==================== Timestamp Formatting ==================== */

/**
 * Format timestamp as relative time (e.g., "5m ago", "2h ago")
 * Unified version combining fmtAgo and formatTimestamp logic
 * @param {string|Date} ts - Timestamp string or Date object
 * @param {Object} options - Formatting options
 * @param {boolean} [options.compact=true] - Use compact format (5m vs 5 minutes ago)
 * @param {boolean} [options.showAgo=true] - Show "ago" suffix
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(ts, options = {}) {
    const { compact = true, showAgo = true } = options;

    if (!ts) return '';

    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';

    const now = Date.now();
    const diff = Math.max(0, now - d.getTime());
    const s = diff / 1000;

    if (s < 60) {
        return compact ? 'now' : (showAgo ? 'just now' : 'now');
    }

    const m = s / 60;
    if (m < 60) {
        return `${Math.floor(m)}${compact ? 'm' : ' minutes'}${showAgo ? ' ago' : ''}`;
    }

    const h = m / 60;
    if (h < 24) {
        return `${Math.floor(h)}${compact ? 'h' : ' hours'}${showAgo ? ' ago' : ''}`;
    }

    const d_val = h / 24;
    if (d_val < 30) {
        return `${Math.floor(d_val)}${compact ? 'd' : ' days'}${showAgo ? ' ago' : ''}`;
    }

    const mo = d_val / 30;
    if (mo < 12) {
        return `${Math.floor(mo)}${compact ? 'mo' : ' months'}${showAgo ? ' ago' : ''}`;
    }

    const y = mo / 12;
    if (compact && y < 1) {
        return `${Math.floor(mo)}mo${showAgo ? ' ago' : ''}`;
    }

    // For very old dates, show actual date
    return d.toLocaleDateString();
}

/* ==================== HTML Escaping ==================== */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ==================== Utility Helpers ==================== */

/**
 * Shorthand for document.getElementById
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Wait for DOM to be ready
 * @param {Function} callback - Callback to execute when ready
 */
function domReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

// Export for use in modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        API_BASE,
        API_KEY_STORAGE_KEY,
        getApiKey,
        setApiKey,
        hasApiKey,
        getJSON,
        toast,
        showError,
        copyResumeLink,
        formatTimestamp,
        escapeHtml,
        $,
        domReady
    };
}

