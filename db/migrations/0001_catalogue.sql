CREATE TYPE "public"."book_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."track_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "book_moods" (
	"book_id" uuid NOT NULL,
	"mood_id" uuid NOT NULL,
	CONSTRAINT "book_moods_book_id_mood_id_pk" PRIMARY KEY("book_id","mood_id")
);
--> statement-breakpoint
ALTER TABLE "book_moods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'uk' NOT NULL,
	"author_id" uuid,
	"narrator_id" uuid,
	"category_id" uuid,
	"status" "book_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"ongoing" boolean DEFAULT false NOT NULL,
	"cover_large_key" text,
	"cover_medium_key" text,
	"cover_small_key" text,
	"duration_seconds" double precision DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_language_check" CHECK ("books"."language" in ('uk', 'en')),
	CONSTRAINT "books_duration_check" CHECK ("books"."duration_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_uk" text NOT NULL,
	"name_en" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"start_seconds" double precision NOT NULL,
	"end_seconds" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_range_check" CHECK ("chapters"."start_seconds" >= 0 and "chapters"."end_seconds" > "chapters"."start_seconds")
);
--> statement-breakpoint
ALTER TABLE "chapters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_uk" text NOT NULL,
	"name_en" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "narrators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "narrators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
	"duration_seconds" double precision DEFAULT 0 NOT NULL,
	"size_bytes" bigint,
	"original_filename" text,
	"status" "track_status" DEFAULT 'uploading' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_duration_check" CHECK ("tracks"."duration_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tracks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_moods" ADD CONSTRAINT "book_moods_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_moods" ADD CONSTRAINT "book_moods_mood_id_moods_id_fk" FOREIGN KEY ("mood_id") REFERENCES "public"."moods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_narrator_id_narrators_id_fk" FOREIGN KEY ("narrator_id") REFERENCES "public"."narrators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authors_slug_key" ON "authors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "book_moods_mood_id_idx" ON "book_moods" USING btree ("mood_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_slug_key" ON "books" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "books_live_published_at_idx" ON "books" USING btree ("published_at" DESC NULLS LAST) WHERE "books"."status" = 'published' and "books"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "books_author_id_idx" ON "books" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "books_category_id_idx" ON "books" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "books_narrator_id_idx" ON "books" USING btree ("narrator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "chapters_book_id_position_idx" ON "chapters" USING btree ("book_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "moods_slug_key" ON "moods" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "narrators_slug_key" ON "narrators" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tracks_book_id_position_idx" ON "tracks" USING btree ("book_id","position");