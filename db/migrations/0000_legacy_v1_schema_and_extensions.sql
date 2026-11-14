-- Phase 0: give the new app a clean `public` schema.
--
-- 1. The v1 (Prisma) tables move to `legacy_v1`. Nothing is dropped: the data is still
--    needed to migrate the four v1 books. Foreign keys and indexes move with the tables.
-- 2. pg_trgm + unaccent are enabled for search (ADR 8), in Supabase's `extensions` schema.
--
-- Every statement is idempotent, so this also runs cleanly on an empty database.

CREATE SCHEMA IF NOT EXISTS legacy_v1;
--> statement-breakpoint
ALTER TABLE IF EXISTS public."Book" SET SCHEMA legacy_v1;
--> statement-breakpoint
ALTER TABLE IF EXISTS public."Chapter" SET SCHEMA legacy_v1;
--> statement-breakpoint
ALTER TABLE IF EXISTS public."PlaybackProgress" SET SCHEMA legacy_v1;
--> statement-breakpoint
ALTER TABLE IF EXISTS public."_prisma_migrations" SET SCHEMA legacy_v1;
--> statement-breakpoint
-- The tables were created in `public`, so Supabase granted them to its API roles.
-- `legacy_v1` is not exposed through the Data API; drop the grants as well.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA legacy_v1 FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
