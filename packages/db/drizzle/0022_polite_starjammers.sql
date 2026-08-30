CREATE TYPE "public"."ai_provider_kind" AS ENUM('openai', 'anthropic', 'openrouter');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_test_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"provider" "ai_provider_kind" NOT NULL,
	"api_url" varchar(500) NOT NULL,
	"model" varchar(200) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_status" "ai_provider_test_status",
	"last_test_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_providers_org_idx" ON "ai_providers" USING btree ("organization_id");