CREATE TYPE "public"."cron_job_run_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "service_cron_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"command" text NOT NULL,
	"cron_expression" varchar(100) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" "cron_job_run_status",
	"last_run_output" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_cron_jobs" ADD CONSTRAINT "service_cron_jobs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_cron_jobs_service_idx" ON "service_cron_jobs" USING btree ("service_id");