CREATE TYPE "public"."application_source_type" AS ENUM('repo', 'static');--> statement-breakpoint
CREATE TABLE "static_uploads" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"filename" varchar(300) NOT NULL,
	"size_bytes" integer NOT NULL,
	"zip_data" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_services" ADD COLUMN "source_type" "application_source_type";--> statement-breakpoint
ALTER TABLE "static_uploads" ADD CONSTRAINT "static_uploads_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;