import {
  JOB_CHECK_CERTIFICATE_STATUS,
  JOB_CHECK_DISK_USAGE,
  JOB_CHECK_DUE_BACKUPS,
  JOB_CHECK_DUE_CRON_JOBS,
  JOB_CHECK_PLATFORM_UPDATE,
  JOB_CHECK_SERVICE_RUN_STATE,
  JOB_DEPLOY_APPLICATION,
  JOB_DEPLOY_COMPOSE,
  JOB_DISPATCH_NOTIFICATION,
  JOB_JOIN_SERVER,
  JOB_PERFORM_PLATFORM_UPDATE,
  JOB_PROVISION_DATABASE,
  JOB_PRUNE_DOCKER_RESOURCES,
  JOB_RELOAD_SERVICE,
  JOB_REMOVE_DOMAIN_CONFIG,
  JOB_REMOVE_ORPHANED_VOLUME,
  JOB_REMOVE_SERVICE,
  JOB_RUN_CRON_JOB,
  JOB_RUN_DATABASE_BACKUP,
  JOB_SET_ACME_EMAIL,
  JOB_START_SERVICE,
  JOB_STOP_SERVICE,
  JOB_SYNC_DOMAINS,
  JOB_SYNC_PLATFORM_DOMAIN,
  checkCertificateStatusJobSchema,
  checkServiceRunStateJobSchema,
  deployApplicationJobSchema,
  deployComposeJobSchema,
  dispatchNotificationJobSchema,
  joinServerJobSchema,
  performPlatformUpdateJobSchema,
  provisionDatabaseJobSchema,
  pruneDockerResourcesJobSchema,
  reloadServiceJobSchema,
  removeDomainConfigJobSchema,
  removeOrphanedVolumeJobSchema,
  removeServiceJobSchema,
  runCronJobJobSchema,
  runDatabaseBackupJobSchema,
  setAcmeEmailJobSchema,
  startServiceJobSchema,
  stopServiceJobSchema,
  syncDomainsJobSchema,
} from "@openploy/shared";
import { registerJobWorker, scheduleJob } from "@openploy/queue";
import { processCheckCertificateStatusJob } from "./workers/check-certificate-status";
import { processCheckDiskUsageJob } from "./workers/check-disk-usage";
import { processCheckDueBackupsJob } from "./workers/check-due-backups";
import { processCheckDueCronJobsJob } from "./workers/check-due-cron-jobs";
import { processCheckPlatformUpdateJob } from "./workers/check-platform-update";
import { processCheckServiceRunStateJob } from "./workers/check-service-run-state";
import { processDeployApplicationJob } from "./workers/deploy-application";
import { processDeployComposeJob } from "./workers/deploy-compose";
import { processDispatchNotificationJob } from "./workers/dispatch-notification";
import { processJoinServerJob } from "./workers/join-server";
import { processProvisionDatabaseJob } from "./workers/provision-database";
import { processPerformPlatformUpdateJob } from "./workers/perform-platform-update";
import { processPruneDockerResourcesJob } from "./workers/prune-docker-resources";
import { processReloadServiceJob } from "./workers/reload-service";
import { processRemoveDomainConfigJob } from "./workers/remove-domain-config";
import { processRemoveOrphanedVolumeJob } from "./workers/remove-orphaned-volume";
import { processRemoveServiceJob } from "./workers/remove-service";
import { processRunCronJobJob } from "./workers/run-cron-job";
import { processRunDatabaseBackupJob } from "./workers/run-database-backup";
import { processSetAcmeEmailJob } from "./workers/set-acme-email";
import { processStartServiceJob } from "./workers/start-service";
import { processStopServiceJob } from "./workers/stop-service";
import { processSyncDomainsJob } from "./workers/sync-domains";
import { processSyncPlatformDomainJob } from "./workers/sync-platform-domain";

/**
 * This process is shared by every service on the platform - one uncaught
 * error anywhere (a stray fire-and-forget write, a bug in a future worker)
 * must never crash the whole thing and silently stop processing every other
 * service's jobs along with it. This is a last-resort net, not a substitute
 * for handling errors at their actual source (see runtime-logs.ts for the
 * incident that motivated it - an orphaned log tail writing to an
 * already-deleted deployment took the entire agent down for everyone).
 */
process.on("unhandledRejection", (err) => {
  console.error("[agent] unhandled rejection (process staying up):", err);
});
process.on("uncaughtException", (err) => {
  console.error("[agent] uncaught exception (process staying up):", err);
});

/**
 * This process is the only one in the whole platform with /var/run/docker.sock
 * access. It never accepts inbound network connections - every command it
 * runs originates from a job on the platform's own Postgres queue (pg-boss),
 * enqueued by apps/web. See the plan's security section for the full rationale.
 */
async function main() {
  // expireInHours: pg-boss's 15-minute default is shorter than a real image
  // build can take (slow first pull, big install) - see QueueOptions for why
  // that silently produced multiple concurrent builds for one deploy.
  await registerJobWorker(
    JOB_DEPLOY_APPLICATION,
    async (data: unknown) => {
      await processDeployApplicationJob(deployApplicationJobSchema.parse(data));
    },
    { expireInHours: 4 },
  );

  await registerJobWorker(
    JOB_PROVISION_DATABASE,
    async (data: unknown) => {
      await processProvisionDatabaseJob(provisionDatabaseJobSchema.parse(data));
    },
    { expireInHours: 4 },
  );

  await registerJobWorker(
    JOB_DEPLOY_COMPOSE,
    async (data: unknown) => {
      await processDeployComposeJob(deployComposeJobSchema.parse(data));
    },
    { expireInHours: 4 },
  );

  await registerJobWorker(JOB_JOIN_SERVER, async (data: unknown) => {
    await processJoinServerJob(joinServerJobSchema.parse(data));
  });

  await registerJobWorker(JOB_REMOVE_DOMAIN_CONFIG, async (data: unknown) => {
    await processRemoveDomainConfigJob(removeDomainConfigJobSchema.parse(data));
  });

  await registerJobWorker(JOB_REMOVE_SERVICE, async (data: unknown) => {
    await processRemoveServiceJob(removeServiceJobSchema.parse(data));
  });

  await registerJobWorker(JOB_SYNC_DOMAINS, async (data: unknown) => {
    await processSyncDomainsJob(syncDomainsJobSchema.parse(data));
  });

  await registerJobWorker(JOB_CHECK_CERTIFICATE_STATUS, async (data: unknown) => {
    await processCheckCertificateStatusJob(checkCertificateStatusJobSchema.parse(data));
  });

  await registerJobWorker(JOB_RELOAD_SERVICE, async (data: unknown) => {
    await processReloadServiceJob(reloadServiceJobSchema.parse(data));
  });

  await registerJobWorker(JOB_STOP_SERVICE, async (data: unknown) => {
    await processStopServiceJob(stopServiceJobSchema.parse(data));
  });

  await registerJobWorker(JOB_START_SERVICE, async (data: unknown) => {
    await processStartServiceJob(startServiceJobSchema.parse(data));
  });

  await registerJobWorker(JOB_CHECK_SERVICE_RUN_STATE, async (data: unknown) => {
    await processCheckServiceRunStateJob(checkServiceRunStateJobSchema.parse(data));
  });

  await registerJobWorker(JOB_CHECK_DISK_USAGE, async () => {
    await processCheckDiskUsageJob();
  });

  await registerJobWorker(JOB_PRUNE_DOCKER_RESOURCES, async (data: unknown) => {
    await processPruneDockerResourcesJob(pruneDockerResourcesJobSchema.parse(data));
  });

  await registerJobWorker(JOB_REMOVE_ORPHANED_VOLUME, async (data: unknown) => {
    await processRemoveOrphanedVolumeJob(removeOrphanedVolumeJobSchema.parse(data));
  });

  await registerJobWorker(JOB_CHECK_DUE_BACKUPS, async () => {
    await processCheckDueBackupsJob();
  });

  // Same reason JOB_DEPLOY_APPLICATION needs one: dumping and uploading a
  // real database easily outlives pg-boss's 15-minute default, which killed
  // the job mid-upload and left the schedule stuck "running".
  await registerJobWorker(
    JOB_RUN_DATABASE_BACKUP,
    async (data: unknown) => {
      await processRunDatabaseBackupJob(runDatabaseBackupJobSchema.parse(data));
    },
    { expireInHours: 4 },
  );

  await registerJobWorker(JOB_SYNC_PLATFORM_DOMAIN, async () => {
    await processSyncPlatformDomainJob();
  });

  await registerJobWorker(JOB_CHECK_DUE_CRON_JOBS, async () => {
    await processCheckDueCronJobsJob();
  });

  await registerJobWorker(JOB_RUN_CRON_JOB, async (data: unknown) => {
    await processRunCronJobJob(runCronJobJobSchema.parse(data));
  });

  await registerJobWorker(JOB_DISPATCH_NOTIFICATION, async (data: unknown) => {
    await processDispatchNotificationJob(dispatchNotificationJobSchema.parse(data));
  });

  await registerJobWorker(JOB_SET_ACME_EMAIL, async (data: unknown) => {
    await processSetAcmeEmailJob(setAcmeEmailJobSchema.parse(data));
  });

  await registerJobWorker(JOB_CHECK_PLATFORM_UPDATE, async () => {
    await processCheckPlatformUpdateJob();
  });

  // Same reason JOB_DEPLOY_APPLICATION needs one: pulling two images and
  // running migrations easily outlives pg-boss's 15-minute default. Only
  // ever enqueued from the owner-gated trigger mutation, never this tick.
  await registerJobWorker(
    JOB_PERFORM_PLATFORM_UPDATE,
    async (data: unknown) => {
      await processPerformPlatformUpdateJob(performPlatformUpdateJobSchema.parse(data));
    },
    { expireInHours: 4 },
  );

  // Upsert, not a one-time bootstrap step - safe (and necessary) to call on
  // every agent restart. See jobs.ts's checkDueBackupsJobSchema comment for
  // why this is the only native pg-boss cron entry the backup feature needs.
  await scheduleJob(JOB_CHECK_DUE_BACKUPS, "*/15 * * * *");

  // Every minute, not 15 - user cron expressions can be minute-granular
  // (e.g. "*/5 * * * *"), so the tick itself must be at least that fine.
  await scheduleJob(JOB_CHECK_DUE_CRON_JOBS, "* * * * *");

  // Hourly - a cheap manifest HEAD, no image pull.
  await scheduleJob(JOB_CHECK_PLATFORM_UPDATE, "0 * * * *");

  console.log("[agent] workers registered, listening for jobs");
}

main().catch((err) => {
  console.error("[agent] fatal startup error", err);
  process.exit(1);
});
