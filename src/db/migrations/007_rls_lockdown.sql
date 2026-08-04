-- Close public Data API access to application data.
--
-- Supabase exposes `public` through PostgREST, and the anon key is publishable
-- by design. Every table here granted anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE
-- with RLS disabled, so anyone holding that key could read the whole reading
-- history or truncate it. Verified before the fix: GET /rest/v1/progress_snapshots
-- with the anon key returned 206 and a row count.
--
-- Enabling RLS with NO policies denies anon and authenticated outright. The
-- table owner `postgres` -- which is what the Express backend connects as via
-- the pooler -- bypasses RLS, so application queries are untouched. FORCE ROW
-- LEVEL SECURITY is deliberately NOT set; that is what would break the owner.
-- Authorisation stays where it already lives: the session and API-key checks
-- in the Express layer.
--
-- The loop covers whatever tables exist when this runs, including any created
-- by schema.ts rather than by a migration file.

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- Defence in depth. Nothing in this project authenticates as anon or
-- authenticated: neither the frontend nor the userscript loads supabase-js, and
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
-- objects. This trigger only calls now() (pg_catalog, always implicitly
-- searched), so an empty search_path is safe.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
