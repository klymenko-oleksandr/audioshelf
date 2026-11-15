-- Supabase exposes the `public` schema through its Data API (REST and GraphQL) and grants
-- its API roles access to every table created there. This app never uses that API: only
-- the Next.js server talks to the database (ADR 4).
--
-- Row Level Security already hides the rows. This removes the grants as well, so the tables
-- are not even listed, and covers tables created by later migrations.
--
-- On a database without the Supabase roles (tests, plain Postgres) the role loop does nothing.

ALTER TABLE IF EXISTS public.__drizzle_migrations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      -- Tables this role (the migration runner) creates from now on.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
