CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"ref" text,
	"payload" jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_renewal_at" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_ref" text;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_user_idx" ON "billing_events" USING btree ("user_id");