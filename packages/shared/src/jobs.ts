import { z } from "zod";

// Postgres-backed job queue (pg-boss) is the only channel through which
// apps/web asks apps/agent to do anything - see packages/queue. Keeping the
// job names and payload shapes here means both sides import the same contract.

export const JOB_DEPLOY_APPLICATION = "deploy-application";
export const JOB_PROVISION_DATABASE = "provision-database";
export const JOB_DEPLOY_COMPOSE = "deploy-compose";
export const JOB_JOIN_SERVER = "join-server";
export const JOB_REMOVE_DOMAIN_CONFIG = "remove-domain-config";
export const JOB_REMOVE_SERVICE = "remove-service";
export const JOB_SYNC_DOMAINS = "sync-domains";
export const JOB_CHECK_CERTIFICATE_STATUS = "check-certificate-status";
export const JOB_RELOAD_SERVICE = "reload-service";
export const JOB_STOP_SERVICE = "stop-service";
export const JOB_START_SERVICE = "start-service";
export const JOB_CHECK_SERVICE_RUN_STATE = "check-service-run-state";
export const JOB_CHECK_DISK_USAGE = "check-disk-usage";
export const JOB_PRUNE_DOCKER_RESOURCES = "prune-docker-resources";
export const JOB_REMOVE_ORPHANED_VOLUME = "remove-orphaned-volume";
export const JOB_CHECK_DUE_BACKUPS = "check-due-backups";
export const JOB_RUN_DATABASE_BACKUP = "run-database-backup";
export const JOB_SYNC_PLATFORM_DOMAIN = "sync-platform-domain";
export const JOB_CHECK_DUE_CRON_JOBS = "check-due-cron-jobs";
export const JOB_RUN_CRON_JOB = "run-cron-job";
export const JOB_DISPATCH_NOTIFICATION = "dispatch-notification";
export const JOB_SET_ACME_EMAIL = "set-acme-email";

export const deployApplicationJobSchema = z.object({ deploymentId: z.string().uuid() });
export type DeployApplicationJob = z.infer<typeof deployApplicationJobSchema>;

export const provisionDatabaseJobSchema = z.object({ serviceId: z.string().uuid(), deploymentId: z.string().uuid() });
export type ProvisionDatabaseJob = z.infer<typeof provisionDatabaseJobSchema>;

export const deployComposeJobSchema = z.object({ deploymentId: z.string().uuid() });
export type DeployComposeJob = z.infer<typeof deployComposeJobSchema>;

export const joinServerJobSchema = z.object({ serverId: z.string().uuid() });
export type JoinServerJob = z.infer<typeof joinServerJobSchema>;

export const removeDomainConfigJobSchema = z.object({ domainId: z.string().uuid() });
export type RemoveDomainConfigJob = z.infer<typeof removeDomainConfigJobSchema>;

// The service row (and everything under it) is already gone by the time this
// runs (web deletes it before enqueueing, same pattern as remove-domain-config) -
// dockerTarget/domainIds are denormalized here rather than re-looked-up because
// there is nothing left in the DB to look them up from.
export const removeServiceJobSchema = z.object({
  serviceId: z.string().uuid(),
  serviceType: z.enum(["application", "database", "compose"]),
  dockerTarget: z.string().nullable(),
  domainIds: z.array(z.string().uuid()),
  // Opt-in, defaults to false: deleting a service alone must never silently
  // take its data volume(s) with it - the user checks a separate box for that.
  deleteVolumes: z.boolean().default(false),
});
export type RemoveServiceJob = z.infer<typeof removeServiceJobSchema>;

// Applying a newly-added domain shouldn't require a redeploy - this re-renders
// Traefik config for every domain currently on the service, computing the
// deploy-time target service name fresh rather than needing it passed in.
export const syncDomainsJobSchema = z.object({ serviceId: z.string().uuid() });
export type SyncDomainsJob = z.infer<typeof syncDomainsJobSchema>;

// Traefik issues the actual certificate entirely on its own (its own ACME
// client, its own acme.json storage) - this job just polls that file with
// backoff (re-enqueueing itself via startAfterSeconds) so the platform's own
// certificates.status row reflects reality instead of staying "pending"
// forever. attempt is 1-based and bounds how long the agent keeps watching.
export const checkCertificateStatusJobSchema = z.object({
  certificateId: z.string().uuid(),
  host: z.string(),
  attempt: z.number().int().min(1),
});
export type CheckCertificateStatusJob = z.infer<typeof checkCertificateStatusJobSchema>;

export const reloadServiceJobSchema = z.object({ serviceId: z.string().uuid() });
export type ReloadServiceJob = z.infer<typeof reloadServiceJobSchema>;

export const stopServiceJobSchema = z.object({ serviceId: z.string().uuid() });
export type StopServiceJob = z.infer<typeof stopServiceJobSchema>;

export const startServiceJobSchema = z.object({ serviceId: z.string().uuid() });
export type StartServiceJob = z.infer<typeof startServiceJobSchema>;

// A container can take much longer than the immediate post-deploy wait to
// actually report "running" (large image pull, slow disk) - this job re-checks
// with backoff (re-enqueueing itself via startAfterSeconds) so services.runtimeStatus
// reflects reality instead of staying "pending" forever. Being a durable queued
// job rather than an in-process promise, it also survives an agent restart
// mid-watch. attempt is 1-based and bounds how long the agent keeps watching.
export const checkServiceRunStateJobSchema = z.object({
  serviceId: z.string().uuid(),
  serviceName: z.string(),
  attempt: z.number().int().min(1),
});
export type CheckServiceRunStateJob = z.infer<typeof checkServiceRunStateJobSchema>;

// No payload - a full disk-usage check always inspects the whole host, not a
// scoped subset. Also enqueued (with no listener waiting) after a prune
// action finishes, so the snapshot the UI reads next reflects what was just reclaimed.
export const checkDiskUsageJobSchema = z.object({});
export type CheckDiskUsageJob = z.infer<typeof checkDiskUsageJobSchema>;

export const pruneDockerResourcesJobSchema = z.object({
  target: z.enum(["containers", "images", "buildCache"]),
  // Only meaningful for target: "images" - widens from dangling-only to every
  // image not referenced by any container, including old deployment tags.
  allImages: z.boolean().default(false),
});
export type PruneDockerResourcesJob = z.infer<typeof pruneDockerResourcesJobSchema>;

// volumeName is re-validated against the platform's own orphaned-volume
// detection server-side before removal, never trusted from this payload alone -
// see check-disk-usage's safety note on why Docker's own "unused" notion isn't enough.
//
// A volume just freed up by a service's own removal can still briefly report
// "in use" - Swarm's `service rm` only tells it to stop, the actual task
// container teardown happens asynchronously and isn't guaranteed to finish
// within any short window. attempt drives a self-requeuing retry (like
// check-service-run-state) instead of an in-process wait, so it isn't lost if
// the agent restarts mid-retry and isn't bounded by an arbitrarily short timeout.
export const removeOrphanedVolumeJobSchema = z.object({
  volumeName: z.string().min(1).max(200),
  attempt: z.number().int().min(1).default(1),
});
export type RemoveOrphanedVolumeJob = z.infer<typeof removeOrphanedVolumeJobSchema>;

// A single static cron entry (see apps/agent's index.ts, scheduled once at
// boot via @openploy/queue's scheduleJob) rather than one native pg-boss cron
// entry per backup schedule - pg-boss's schedule() ties one cron expression
// to exactly one queue name, so N independently-timed schedules would need N
// dynamically-registered workers. Instead this "tick" job runs every few
// minutes and enqueues checkDatabaseBackupDueJobSchema jobs for whichever
// schedules are actually due, re-derived fresh from the DB every tick - also
// means a schedule created/edited/deleted from apps/web needs no coordination
// with the agent's already-running process at all, it just changes what the
// next tick finds due.
export const checkDueBackupsJobSchema = z.object({});
export type CheckDueBackupsJob = z.infer<typeof checkDueBackupsJobSchema>;

export const runDatabaseBackupJobSchema = z.object({
  scheduleId: z.string().uuid(),
});
export type RunDatabaseBackupJob = z.infer<typeof runDatabaseBackupJobSchema>;

// Same tick pattern as checkDueBackupsJobSchema above, but ticking every
// minute instead of every 15 - user cron expressions can be minute-granular
// (e.g. "*/5 * * * *"), so the tick itself must be at least that fine to
// notice they're due promptly.
export const checkDueCronJobsJobSchema = z.object({});
export type CheckDueCronJobsJob = z.infer<typeof checkDueCronJobsJobSchema>;

export const runCronJobJobSchema = z.object({
  cronJobId: z.string().uuid(),
});
export type RunCronJobJob = z.infer<typeof runCronJobJobSchema>;

// No payload - platformDomains is a singleton, so this just re-reads whatever
// the current row (or lack of one) is and reconciles the Traefik dynamic
// config file to match, the same reconciliation style as checkDiskUsageJobSchema.
export const syncPlatformDomainJobSchema = z.object({});
export type SyncPlatformDomainJob = z.infer<typeof syncPlatformDomainJobSchema>;

export const notificationEventSchema = z.enum(["deployment_success", "deployment_failed", "backup_success", "backup_failed"]);
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

// Enqueued (fire-and-forget, never awaited) from the deploy/backup workers at
// their success/failure points - a slow or unreachable notification channel
// must never delay or fail the deploy/backup itself. organizationId, not
// serviceId, since the whole point is fanning out to every channel an org
// subscribed for this event, not one specific one.
export const dispatchNotificationJobSchema = z.object({
  organizationId: z.string().uuid(),
  event: notificationEventSchema,
  context: z.object({
    serviceName: z.string(),
    projectName: z.string(),
    dashboardUrl: z.string(),
    durationSeconds: z.number().optional(),
  }),
});
export type DispatchNotificationJob = z.infer<typeof dispatchNotificationJobSchema>;

// Rewrites Traefik's static config with this email and wipes its stored ACME
// account (see packages/docker's rewriteTraefikStaticConfig for why the wipe
// is required) - enqueued once from signupInitialAdmin using the first
// admin's own signup email, and again any time it's changed later from
// Settings > Dashboard domain.
export const setAcmeEmailJobSchema = z.object({ email: z.string().email() });
export type SetAcmeEmailJob = z.infer<typeof setAcmeEmailJobSchema>;

// Cheap tick (GHCR manifest HEAD + reading the two services' live specs, no
// image pull) - see apps/agent/src/workers/check-platform-update.ts.
export const JOB_CHECK_PLATFORM_UPDATE = "check-platform-update";
export const checkPlatformUpdateJobSchema = z.object({});
export type CheckPlatformUpdateJob = z.infer<typeof checkPlatformUpdateJobSchema>;

// Only ever enqueued from the owner-gated trigger mutation, never the tick
// above. Pulls both images, runs migrations, and rolling-updates both
// services - see apps/agent/src/workers/perform-platform-update.ts for the
// ordering (agent updates itself last, since that kills the process running
// this job). version is the release tag to update *to* - resolved once by
// the trigger mutation from platformSettings.latestVersion, not re-checked
// here, since a `:latest` re-check partway through the job could pull a
// different version than what the check that surfaced this button saw.
export const JOB_PERFORM_PLATFORM_UPDATE = "perform-platform-update";
export const performPlatformUpdateJobSchema = z.object({ version: z.string() });
export type PerformPlatformUpdateJob = z.infer<typeof performPlatformUpdateJobSchema>;
