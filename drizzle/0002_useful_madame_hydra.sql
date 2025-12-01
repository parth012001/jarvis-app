CREATE TYPE "public"."email_trigger_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TABLE "email_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trigger_id" text NOT NULL,
	"connected_account_id" text NOT NULL,
	"status" "email_trigger_status" DEFAULT 'active' NOT NULL,
	"last_triggered_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_triggers_trigger_id_unique" UNIQUE("trigger_id"),
	CONSTRAINT "email_triggers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "email_triggers" ADD CONSTRAINT "email_triggers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_triggers_user_id_idx" ON "email_triggers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_triggers_trigger_id_idx" ON "email_triggers" USING btree ("trigger_id");