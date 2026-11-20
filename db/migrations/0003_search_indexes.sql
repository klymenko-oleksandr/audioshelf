-- Search (ADR 8): fuzzy matching on titles and people with pg_trgm + unaccent, which
-- migration 0000 installed in the `extensions` schema.
--
-- `search_norm` lower-cases and strips accents (and maps й→и, ё→е, as unaccent does), so
-- "Перстень", "перстень" and "ПЕРСТЕНЬ" are the same word. It is declared IMMUTABLE, which
-- unaccent itself is not, so that it can be used in an index. That is safe here because the
-- unaccent dictionary this app uses never changes. Both sides of every comparison go through
-- it: the indexed column and the listener's query.
--
-- With a few dozen books Postgres reads the tables directly; the indexes are for when the
-- catalogue grows. They are not in `db/schema.ts` (Drizzle cannot express an operator class
-- from another schema); this file is their only definition.
CREATE OR REPLACE FUNCTION public.search_norm(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, lower(value))
$$;
--> statement-breakpoint
-- Supabase's Data API would publish a function in `public` as an RPC endpoint (see 0002);
-- only the server's own connection needs this one.
DO $$
DECLARE
  api_role text;
BEGIN
  REVOKE ALL ON FUNCTION public.search_norm(text) FROM PUBLIC;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.search_norm(text) FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS books_title_trgm_idx
  ON public.books USING gin (public.search_norm(title) extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS authors_name_trgm_idx
  ON public.authors USING gin (public.search_norm(name) extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS narrators_name_trgm_idx
  ON public.narrators USING gin (public.search_norm(name) extensions.gin_trgm_ops);
