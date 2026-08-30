CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"acme_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
