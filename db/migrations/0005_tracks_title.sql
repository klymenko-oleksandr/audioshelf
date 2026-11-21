ALTER TABLE "tracks" ADD COLUMN "title" text DEFAULT '' NOT NULL;
--> statement breakpoint
-- Existing tracks take the title of the chapter at the same position (one chapter per track so far).
UPDATE "tracks" t SET "title" = c."title" FROM "chapters" c WHERE c."book_id" = t."book_id" AND c."position" = t."position" AND t."title" = '';
