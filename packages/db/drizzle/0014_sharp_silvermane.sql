CREATE TYPE "public"."backup_frequency" AS ENUM('hourly', 'every_6_hours', 'every_12_hours', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."backup_run_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "database_backup_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"backup_storage_config_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"frequency" "backup_frequency" NOT NULL,
	"retention_count" integer,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" "backup_run_status",
	"last_run_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "database_backup_schedules" ADD CONSTRAINT "database_backup_schedules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_backup_schedules" ADD CONSTRAINT "database_backup_schedules_backup_storage_config_id_backup_storage_configs_id_fk" FOREIGN KEY ("backup_storage_config_id") REFERENCES "public"."backup_storage_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "database_backup_schedules_service_idx" ON "database_backup_schedules" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "database_backup_schedules_storage_idx" ON "database_backup_schedules" USING btree ("backup_storage_config_id");