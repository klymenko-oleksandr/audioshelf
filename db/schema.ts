/**
 * Drizzle schema for the `public` schema — the single source of truth for tables.
 *
 * Phase 0 intentionally defines no tables: the first migration only moves the v1
 * (Prisma) tables into `legacy_v1` and enables pg_trgm + unaccent.
 * Catalogue tables arrive in Phase 3, sync tables in Phase 6.
 */
export {};
