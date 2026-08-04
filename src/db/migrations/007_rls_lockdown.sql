-- Close public Data API access to application data.
--
-- Supabase exposes the `public` schema through PostgREST, and the anon key is
-- publishable by design. Every table here granted anon SELECT/INSERT/UPDATE/
-- DELETE/TRUNCATE with RLS disabled, so anyone holding that key could read the
-- whole reading history or truncate it. Verified before the fix: a GET to
-- /rest/v1/progress_snapshots with the anon key returned 206 and a row count.
--
-- Enabling RLS with NO policies denies anon and authenticated outright. The
-- table owner `postgres`, which is what the Express backend connects as through
-- the pooler, bypasses RLS, so application queries are untouched. Note that
-- FORCE ROW LEVEL SECURITY is deliberately not set, because that is the flag
-- that would break the owner. Authorisation stays where it already lives, in
-- the session and API-key checks in the Express layer.
--
-- Style note: the migration runner splits this file on semicolons, so every
-- statement must be a single statement. No DO blocks, and no semicolons inside
-- comments. IF EXISTS keeps a fresh database from failing on a table that a
-- later migration has not created yet.

ALTER TABLE IF EXISTS public.bookmarks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.devices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.novel_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.novel_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.novel_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.novels               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.progress_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reading_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schema_migrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_novel_meta      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users                ENABLE ROW LEVEL SECURITY;

-- Defence in depth. Nothing in this project authenticates as anon or
-- authenticated. Neither the frontend nor the userscript loads supabase-js, and
-- the server uses the service key for Storage only, which lives in the
-- `storage` schema and is unaffected by these revokes.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Stop future tables from inheriting the blanket grants again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- A mutable search_path lets a caller resolve unqualified names to their own
-- objects. This trigger only calls now(), which lives in pg_catalog and is
-- always implicitly searched, so an empty search_path is safe.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
