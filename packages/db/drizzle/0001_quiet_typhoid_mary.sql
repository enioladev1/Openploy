ALTER TABLE "application_services" ADD COLUMN "cpu_limit" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "application_services" ADD COLUMN "memory_limit_mb" integer DEFAULT 512 NOT NULL;--> statement-breakpoint
ALTER TABLE "database_services" ADD COLUMN "cpu_limit" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "database_services" ADD COLUMN "memory_limit_mb" integer DEFAULT 512 NOT NULL;