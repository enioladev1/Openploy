CREATE TYPE "public"."env_var_reference_field" AS ENUM('connection_string', 'host', 'port', 'username', 'password', 'database_name');--> statement-breakpoint
ALTER TABLE "environment_variables" ALTER COLUMN "value_encrypted" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD COLUMN "references_service_id" uuid;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD COLUMN "references_field" "env_var_reference_field";--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_references_service_id_services_id_fk" FOREIGN KEY ("references_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_variables_references_service_idx" ON "environment_variables" USING btree ("references_service_id");