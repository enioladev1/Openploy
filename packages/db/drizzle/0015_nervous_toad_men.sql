CREATE TABLE "platform_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"host" varchar(253) NOT NULL,
	"certificate_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_domains" ADD CONSTRAINT "platform_domains_certificate_id_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."certificates"("id") ON DELETE set null ON UPDATE no action;