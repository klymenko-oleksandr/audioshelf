CREATE TYPE "sync_flag_kind" AS ENUM ('like', 'listen_later');
--> statement-breakpoint
CREATE SEQUENCE "sync_change_seq";
--> statement-breakpoint
CREATE TABLE "sync_devices" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "device_id" uuid NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "clock_offset_ms" integer NOT NULL DEFAULT 0,
  "last_push_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "device_id")
);
--> statement-breakpoint
CREATE TABLE "sync_progress" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "position_seconds" double precision NOT NULL,
  "duration_seconds" double precision NOT NULL,
  "speed" real NOT NULL DEFAULT 1,
  "finished" boolean NOT NULL DEFAULT false,
  "dismissed_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  "device_id" uuid NOT NULL,
  "seq" bigint NOT NULL DEFAULT nextval('sync_change_seq'),
  PRIMARY KEY ("user_id", "book_id")
);
--> statement-breakpoint
CREATE TABLE "sync_flags" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "kind" "sync_flag_kind" NOT NULL,
  "added_at" timestamp with time zone NOT NULL,
  "deleted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  "device_id" uuid NOT NULL,
  "seq" bigint NOT NULL DEFAULT nextval('sync_change_seq'),
  PRIMARY KEY ("user_id", "book_id", "kind")
);
--> statement-breakpoint
CREATE TABLE "sync_history" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "book_id" uuid NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "started_at" timestamp with time zone NOT NULL,
  "last_played_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  "device_id" uuid NOT NULL,
  "seq" bigint NOT NULL DEFAULT nextval('sync_change_seq'),
  PRIMARY KEY ("user_id", "book_id")
);
--> statement-breakpoint
CREATE TABLE "sync_settings" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "device_id" uuid NOT NULL,
  "seq" bigint NOT NULL DEFAULT nextval('sync_change_seq'),
  PRIMARY KEY ("user_id", "key")
);
--> statement-breakpoint
CREATE INDEX "sync_progress_user_seq" ON "sync_progress" ("user_id", "seq");
--> statement-breakpoint
CREATE INDEX "sync_flags_user_seq" ON "sync_flags" ("user_id", "seq");
--> statement-breakpoint
CREATE INDEX "sync_history_user_seq" ON "sync_history" ("user_id", "seq");
--> statement-breakpoint
CREATE INDEX "sync_settings_user_seq" ON "sync_settings" ("user_id", "seq");
--> statement-breakpoint
ALTER TABLE "sync_devices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_progress" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_flags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "sync_devices", "sync_progress", "sync_flags", "sync_history", "sync_settings" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE "sync_change_seq" FROM anon, authenticated;
