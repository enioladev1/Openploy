import { router } from "../trpc";
import { aiDebugRouter } from "./ai-debug";
import { aiProvidersRouter } from "./ai-providers";
import { auditLogRouter } from "./audit-log";
import { backupsRouter } from "./backups";
import { cronJobsRouter } from "./cron-jobs";
import { databaseBackupsRouter } from "./database-backups";
import { deploymentsRouter } from "./deployments";
import { diskUsageRouter } from "./disk-usage";
import { domainsRouter } from "./domains";
import { envVarsRouter } from "./env-vars";
import { githubRouter } from "./github";
import { notificationsRouter } from "./notifications";
import { platformDomainRouter } from "./platform-domain";
import { platformUpdateRouter } from "./platform-update";
import { profileRouter } from "./profile";
import { projectsRouter } from "./projects";
import { serversRouter } from "./servers";
import { servicesRouter } from "./services";
import { systemStatsRouter } from "./system-stats";
import { usersRouter } from "./users";

export const appRouter = router({
  projects: projectsRouter,
  github: githubRouter,
  services: servicesRouter,
  envVars: envVarsRouter,
  domains: domainsRouter,
  deployments: deploymentsRouter,
  servers: serversRouter,
  diskUsage: diskUsageRouter,
  backups: backupsRouter,
  databaseBackups: databaseBackupsRouter,
  platformDomain: platformDomainRouter,
  platformUpdate: platformUpdateRouter,
  systemStats: systemStatsRouter,
  profile: profileRouter,
  users: usersRouter,
  auditLog: auditLogRouter,
  cronJobs: cronJobsRouter,
  notifications: notificationsRouter,
  aiProviders: aiProvidersRouter,
  aiDebug: aiDebugRouter,
});

export type AppRouter = typeof appRouter;
