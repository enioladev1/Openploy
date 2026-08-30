import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "../columns";
import { services } from "./services";

export const cronJobRunStatusEnum = pgEnum("cron_job_run_status", ["running", "success", "failed"]);

/**
 * One row per scheduled command for a service - a service can have more than
 * one (e.g. a migration job and a separate cache-clear job). Unlike
 * databaseBackupSchedules' fixed frequency enum, cronExpression is a raw
 * user-supplied cron string (standard 5-field syntax) - this is a "cron job"
 * feature in the literal sense, so arbitrary schedules are the point.
 * apps/agent evaluates due-ness itself every minute (see
 * check-due-cron-jobs.ts) rather than registering one pg-boss cron per row,
 * for the same reason described on checkDueBackupsJobSchema in
 * packages/shared/src/jobs.ts - pg-boss ties one cron expression to exactly
 * one queue name, not one per dynamically-created row.
 */
export const serviceCronJobs = pgTable(
  "service_cron_jobs",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    command: text("command").notNull(),
    cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: cronJobRunStatusEnum("last_run_status"),
    // Truncated stdout/stderr tail from the most recent run, success or
    // failure - the primary reason to view a cron job's history is usually
    // the command's own output (e.g. what a migration printed), not just pass/fail.
    lastRunOutput: text("last_run_output"),
    ...timestamps(),
  },
  (table) => [index("service_cron_jobs_service_idx").on(table.serviceId)],
);

/**
 * Full run history for a cron job - serviceCronJobs.lastRun* only ever holds
 * the most recent run for the quick list view; every run (including the
 * current one) also gets a row here. command is snapshotted at run time
 * rather than joined from the parent job, so a run's history stays accurate
 * even if the job's command is ever edited later.
 */
export const serviceCronJobRuns = pgTable(
  "service_cron_job_runs",
  {
    id: id(),
    cronJobId: uuid("cron_job_id")
      .notNull()
      .references(() => serviceCronJobs.id, { onDelete: "cascade" }),
    command: text("command").notNull(),
    status: cronJobRunStatusEnum("status").notNull(),
    output: text("output"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("service_cron_job_runs_cron_job_idx").on(table.cronJobId, table.startedAt)],
);
