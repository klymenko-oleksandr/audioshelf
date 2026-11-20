CREATE TABLE "admin_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	CONSTRAINT "admin_login_attempts_count_check" CHECK ("admin_login_attempts"."failed_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "admin_login_attempts_last_attempt_at_idx" ON "admin_login_attempts" USING btree ("last_attempt_at");