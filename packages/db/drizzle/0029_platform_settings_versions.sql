ALTER TABLE "platform_settings" DROP COLUMN "current_web_digest";--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "current_agent_digest";--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "latest_web_digest";--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "latest_agent_digest";--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "current_web_version" varchar(50);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "current_agent_version" varchar(50);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "latest_version" varchar(50);