import "server-only";
import { and, count, countDistinct, desc, eq, sql } from "drizzle-orm";
import { projects, services } from "@openploy/db";
import { db } from "../db";

export async function getDashboardStats(organizationId: string) {
  const [row] = await db
    .select({
      projectCount: countDistinct(projects.id),
      applicationCount: count(sql`case when ${services.type} = 'application' then 1 end`),
      databaseCount: count(sql`case when ${services.type} = 'database' then 1 end`),
      composeCount: count(sql`case when ${services.type} = 'compose' then 1 end`),
      runningCount: count(sql`case when ${services.runtimeStatus} = 'running' then 1 end`),
    })
    .from(projects)
    .leftJoin(services, eq(services.projectId, projects.id))
    .where(eq(projects.organizationId, organizationId));

  const applicationCount = row?.applicationCount ?? 0;
  const databaseCount = row?.databaseCount ?? 0;
  const composeCount = row?.composeCount ?? 0;

  return {
    projectCount: row?.projectCount ?? 0,
    applicationCount,
    databaseCount,
    composeCount,
    serviceCount: applicationCount + databaseCount + composeCount,
    runningCount: row?.runningCount ?? 0,
  };
}

export async function getRunningContainers(organizationId: string) {
  return db
    .select({ id: services.id, name: services.name, since: services.runtimeStatusChangedAt })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(projects.organizationId, organizationId), eq(services.runtimeStatus, "running")))
    .orderBy(desc(services.runtimeStatusChangedAt));
}
