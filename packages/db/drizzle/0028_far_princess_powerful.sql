CREATE TYPE "public"."platform_update_status" AS ENUM('idle', 'running', 'success', 'failed');--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_status" "platform_update_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "update_error" text;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "current_web_digest" varchar(71);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "current_agent_digest" varchar(71);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "latest_web_digest" varchar(71);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "latest_agent_digest" varchar(71);