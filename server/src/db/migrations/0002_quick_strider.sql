CREATE TABLE "flow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"flow_name" text NOT NULL,
	"status" text NOT NULL,
	"node_count" integer NOT NULL,
	"chains" text[] NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "flow_runs_user_idx" ON "flow_runs" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"role_other" text,
	"heard_from" text NOT NULL,
	"heard_other" text,
	"newsletter" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_user_unique" ON "onboarding" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
