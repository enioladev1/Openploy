import "server-only";
import { auditLogs } from "@openploy/db";
import type { Database } from "@openploy/db";

export interface AuditEvent {
  organizationId: string;
  actorUserId: string | null;
  action: string; // "resource.verb", e.g. "user.create", "env.reveal"
  targetType: string;
  targetId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * The only place application code ever writes to audit_logs - never call
 * db.insert(auditLogs) directly elsewhere, so this stays the one spot to
 * check when auditing what gets logged. Deliberately has no update/delete
 * counterpart: this table is append-only by design (see audit.ts's schema
 * comment for why that isn't also enforced at the Postgres role level yet).
 * Accepts either the shared db handle or an open transaction, so a caller
 * already inside db.transaction(...) can log atomically with its other writes.
 */
export async function logAuditEvent(dbOrTx: Pick<Database, "insert">, event: AuditEvent): Promise<void> {
  await dbOrTx.insert(auditLogs).values({
    organizationId: event.organizationId,
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    metadata: event.metadata,
  });
}
