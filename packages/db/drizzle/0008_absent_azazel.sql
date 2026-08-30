CREATE TABLE "disk_usage_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"summary" jsonb NOT NULL,
	"orphaned_volumes" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
