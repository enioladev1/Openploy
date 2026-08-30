CREATE TYPE "public"."backup_provider" AS ENUM('aws-s3', 'cloudflare-r2', 's3-compatible');--> statement-breakpoint
CREATE TABLE "backup_storage_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"provider" "backup_provider" NOT NULL,
	"account_id" varchar(100),
	"endpoint" varchar(500),
	"region" varchar(100) NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"path_prefix" varchar(500) DEFAULT '' NOT NULL,
	"force_path_style" boolean DEFAULT false NOT NULL,
	"access_key_id" varchar(255) NOT NULL,
	"secret_access_key_encrypted" text NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_storage_configs" ADD CONSTRAINT "backup_storage_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_storage_configs_org_idx" ON "backup_storage_configs" USING btree ("organization_id");