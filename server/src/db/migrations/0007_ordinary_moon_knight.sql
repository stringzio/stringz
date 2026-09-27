ALTER TABLE "simulation_runs" ADD COLUMN "started_at" text;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "cost_est_usd" numeric(14, 8);