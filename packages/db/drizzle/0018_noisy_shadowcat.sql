CREATE TABLE "service_cron_job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cron_job_id" uuid NOT NULL,
	"command" text NOT NULL,
	"status" "cron_job_run_status" NOT NULL,
	"output" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "service_cron_job_runs" ADD CONSTRAINT "service_cron_job_runs_cron_job_id_service_cron_jobs_id_fk" FOREIGN KEY ("cron_job_id") REFERENCES "public"."service_cron_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_cron_job_runs_cron_job_idx" ON "service_cron_job_runs" USING btree ("cron_job_id","started_at");