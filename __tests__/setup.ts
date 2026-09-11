// Set required env vars before any module loads
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
if (process.env.READSYNC_TEST_DATABASE_URL) {
  const target = new URL(process.env.READSYNC_TEST_DATABASE_URL);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/readsync_audit') {
    throw new Error('Integration tests require a disposable localhost readsync_audit database');
  }
  process.env.DATABASE_URL = target.toString();
}
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD_HASH = '$2b$10$placeholder.hash.for.testing.only';
