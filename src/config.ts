import 'dotenv/config';

// ── Server ──────────────────────────────────────────────────────────────────
export const PORT = parseInt(process.env.PORT ?? '3000', 10);
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// ── Database pool ────────────────────────────────────────────────────────────
export const PG_POOL_MAX = parseInt(process.env.PG_POOL_MAX ?? '20', 10);
export const PG_IDLE_TIMEOUT_MS = parseInt(
  process.env.PG_IDLE_TIMEOUT ?? '30000',
  10,
);
export const PG_CONN_TIMEOUT_MS = parseInt(
  process.env.PG_CONN_TIMEOUT ?? '10000',
  10,
);
export const PG_STATEMENT_TIMEOUT_MS = 30_000;

// ── Body limits ──────────────────────────────────────────────────────────────
export const JSON_BODY_LIMIT = '10mb';

// ── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 200;
export const MIN_PAGE_LIMIT = 1;
export const MAX_PAGE_LIMIT = 200;

// ── String length constraints ────────────────────────────────────────────────
export const MAX_NOVEL_ID_LENGTH = 200;
export const MAX_DEVICE_ID_LENGTH = 200;
export const MAX_DEVICE_LABEL_LENGTH = 200;
export const MAX_NOTE_TEXT_LENGTH = 5000;

// ── Percentage bounds ────────────────────────────────────────────────────────
export const MIN_PERCENT = 0;
export const MAX_PERCENT = 100;

// ── Progress thresholds ──────────────────────────────────────────────────────
export const CHAPTER_RESTART_THRESHOLD_PERCENT = 1;
export const SIGNIFICANT_PROGRESS_THRESHOLD_PERCENT = 10;
export const DEVICE_BEHIND_THRESHOLD_PERCENT = 20;
export const AUTO_REREAD_CHAPTER_THRESHOLD = 50;

// ── Time constants (ms) ──────────────────────────────────────────────────────
export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

// ── Analytics ────────────────────────────────────────────────────────────────
export const DEFAULT_ANALYTICS_DAYS = 30;
export const MIN_ANALYTICS_HOURS = 1;
export const MAX_ANALYTICS_HOURS = 168; // 7 days
export const DEFAULT_ANALYTICS_HOURS = 24;

// ── Auth ─────────────────────────────────────────────────────────────────────
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60_000; // 15 minutes
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── HTTP status codes ────────────────────────────────────────────────────────
export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_INTERNAL_ERROR = 500;

export const DECIMAL_RADIX = 10;

// ── CORS ─────────────────────────────────────────────────────────────────────
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['https://readsync-n7zp.onrender.com', 'http://localhost:3000'];

// ── Supabase ─────────────────────────────────────────────────────────────────
export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

// ── Admin credentials ────────────────────────────────────────────────────────
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '';

// ── Session ───────────────────────────────────────────────────────────────────
export const SESSION_SECRET = process.env.SESSION_SECRET ?? '';

// ── Database URL ─────────────────────────────────────────────────────────────
export const DATABASE_URL = process.env.DATABASE_URL ?? '';

export function validateEnvironment(): void {
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => {
      console.error(`  - ${key}`);
    });
    process.exit(1);
  }

  if (!ADMIN_PASSWORD_HASH) {
    console.warn(
      'ADMIN_PASSWORD_HASH not set — dashboard login will be disabled',
    );
  }
}
