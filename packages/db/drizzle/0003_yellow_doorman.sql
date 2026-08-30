ALTER TABLE "database_services" ADD COLUMN "database_name" varchar(100) DEFAULT 'dentity' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_services" ADD COLUMN "username" varchar(100);--> statement-breakpoint
ALTER TABLE "database_services" ADD COLUMN "root_credentials_secret_id" uuid;