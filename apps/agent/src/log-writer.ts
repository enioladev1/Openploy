import { desc, eq } from "drizzle-orm";
import { deploymentLogs } from "@openploy/db";
import { db } from "./db";

export type LogStream = "build" | "runtime";

export interface LogWriter {
  write: (stream: LogStream, rawLine: string) => Promise<void>;
}

const writers = new Map<string, LogWriter>();

/**
 * One writer per deployment, shared by every caller for the life of the
 * agent process - the build-stage writer, the ongoing runtime log tail, and
 * finalizeServiceRunState's one-off status messages all write to the same
 * deploymentId, and each used to construct its own independent in-memory
 * counter starting at 0. That's exactly how two unrelated writers both
 * produced sequence=1 for the same deployment and broke the log viewers'
 * React keys (and, worse, is genuinely ambiguous data - two rows claiming
 * the same position in the log).
 *
 * Resumes from the highest sequence already persisted (rather than always
 * starting at 0) so a from-scratch writer - the first one created after an
 * agent restart mid-deployment - doesn't collide with rows a previous
 * process lifetime already wrote either. The lazy init is done through a
 * single shared promise so concurrent early writes can't both read the same
 * "last sequence" before either has written.
 */
export function createLogWriter(deploymentId: string, redact: (line: string) => string): LogWriter {
  const existing = writers.get(deploymentId);
  if (existing) return existing;

  let sequence = 0;
  let initPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const [last] = await db
        .select({ sequence: deploymentLogs.sequence })
        .from(deploymentLogs)
        .where(eq(deploymentLogs.deploymentId, deploymentId))
        .orderBy(desc(deploymentLogs.sequence))
        .limit(1);
      sequence = last?.sequence ?? 0;
    })();
    return initPromise;
  }

  const writer: LogWriter = {
    write: async (stream, rawLine) => {
      await ensureInitialized();
      sequence += 1;
      await db.insert(deploymentLogs).values({
        deploymentId,
        stream,
        sequence,
        content: redact(rawLine),
      });
    },
  };

  writers.set(deploymentId, writer);
  return writer;
}
