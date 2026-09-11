-- Published userscript credentials are compromised. No usable plaintext keys
-- survive this migration. Sign in and issue a fresh, one-time-visible key.
UPDATE users SET api_key = 'revoked:' || id;
-- Existing sessions predate explicit tenant binding. Require a fresh login.
DELETE FROM session;
