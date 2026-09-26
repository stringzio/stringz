CREATE TABLE "simulation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"flow_id" text,
	"status" text NOT NULL,
	"trigger_idx" integer DEFAULT 0 NOT NULL,
	"exit_code" integer,
	"result" text,
	"error_class" text,
	"src_gcs_uri" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulation_runs_user_idx" ON "simulation_runs" USING btree ("user_id");