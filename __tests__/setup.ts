// Set required env vars before any module loads
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD_HASH = '$2b$10$placeholder.hash.for.testing.only';
