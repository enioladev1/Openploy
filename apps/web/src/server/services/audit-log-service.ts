import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { auditLogs, users } from "@openploy/db";
import { db } from "../db";

export const AUDIT_LOG_PAGE_SIZE = 20;

// No update/delete counterpart on this file, deliberately - audit_logs is
// append-only (see logAuditEvent in ../audit.ts, the only writer).
export async function listAuditLogs(organizationId: string, page = 1) {
  const offset = (page - 1) * AUDIT_LOG_PAGE_SIZE;

  const [items, [totalRow]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(eq(auditLogs.organizationId, organizationId))
      // id (UUIDv7, time-sortable) is a deterministic tiebreaker - createdAt
      // alone ties for every row written in the same statement (e.g. a bulk
      // insert), which without a secondary key lets Postgres return rows in
      // a different order per query and duplicate/skip rows across pages.
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(AUDIT_LOG_PAGE_SIZE)
      .offset(offset),
    db.select({ count: count() }).from(auditLogs).where(eq(auditLogs.organizationId, organizationId)),
  ]);

  const totalCount = totalRow?.count ?? 0;
  return {
    items,
    page,
    pageSize: AUDIT_LOG_PAGE_SIZE,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / AUDIT_LOG_PAGE_SIZE)),
  };
}
