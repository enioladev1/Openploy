ALTER TABLE "notification_channels" ADD COLUMN "smtp_to_email" varchar(320);--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "resend_to_email" varchar(320);