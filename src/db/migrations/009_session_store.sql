-- Persist sessions in Postgres instead of the Node process heap.
--
-- app.ts configured express-session with no store, so it fell back to
-- MemoryStore. Sessions lived in the process, which meant every deploy and
-- every free-tier hibernation wiped them. requireAuthAPI accepts only
-- req.session.authenticated, so the page still served while every API call
-- returned 401 - which reads as a broken app rather than a logout.
--
-- This is the table layout connect-pg-simple expects. The primary key is
-- declared inline rather than added afterwards so the whole file stays
-- idempotent.
--
-- Style note: the runner splits this file on semicolons, so no DO blocks and no
-- semicolons inside comments.

-- connect-pg-simple's documented layout uses a bare timestamp for expire. That
-- is deliberately changed to TIMESTAMPTZ here, matching 004 and the repo's
-- migration regression test. The library prunes with to_timestamp(), which
-- yields timestamptz, so a bare timestamp would be coerced through whatever
-- TimeZone the session happens to carry - exactly the bug 004 fixed.
CREATE TABLE IF NOT EXISTS public.session (
  sid    varchar PRIMARY KEY NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamptz(6) NOT NULL
);

-- connect-pg-simple prunes expired rows on a timer and needs this to do it
-- without a sequential scan.
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session (expire);

-- Matches the lockdown in 007. The Data API is disabled and the app connects as
-- the table owner, so this is defence in depth rather than load-bearing, but a
-- table holding session material should not be the one exception.
ALTER TABLE IF EXISTS public.session ENABLE ROW LEVEL SECURITY;
