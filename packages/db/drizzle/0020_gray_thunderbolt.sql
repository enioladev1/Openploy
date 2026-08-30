CREATE TYPE "public"."notification_channel_type" AS ENUM('telegram', 'smtp', 'resend');--> statement-breakpoint
CREATE TYPE "public"."notification_test_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "notification_channel_type" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"telegram_chat_id" varchar(100),
	"telegram_bot_token_encrypted" text,
	"smtp_host" varchar(255),
	"smtp_port" integer,
	"smtp_secure" boolean,
	"smtp_username" varchar(255),
	"smtp_password_encrypted" text,
	"smtp_from_email" varchar(320),
	"smtp_from_name" varchar(200),
	"resend_api_key_encrypted" text,
	"resend_from_email" varchar(320),
	"resend_from_name" varchar(200),
	"notify_on_deployment_success" boolean DEFAULT false NOT NULL,
	"notify_on_deployment_failed" boolean DEFAULT true NOT NULL,
	"notify_on_backup_success" boolean DEFAULT false NOT NULL,
	"notify_on_backup_failed" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_status" "notification_test_status",
	"last_test_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_channels_org_idx" ON "notification_channels" USING btree ("organization_id");