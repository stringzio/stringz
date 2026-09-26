CREATE TABLE "simulation_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"event" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulation_events_run_idx" ON "simulation_events" USING btree ("run_id", "seq");
