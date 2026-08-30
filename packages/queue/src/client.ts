import PgBoss from "pg-boss";

let cachedBoss: PgBoss | null = null;

/**
 * pg-boss on the platform's own Postgres is the entire transport between
 * apps/web and apps/agent - no custom RPC layer, no direct network call from
 * web to agent. web enqueues, agent (the only process with Docker access) works.
 */
export async function getBoss(): Promise<PgBoss> {
  if (cachedBoss) return cachedBoss;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  cachedBoss = boss;
  return boss;
}

const ensuredQueues = new Set<string>();

export interface QueueOptions {
  /**
   * pg-boss's own default (15 minutes) is meant for ordinary jobs, not a real
   * Docker build - once a job runs longer than this, pg-boss assumes it died
   * and redelivers it to a fresh worker, but the original invocation is never
   * actually cancelled and keeps running. That produced multiple concurrent
   * `docker build`s for a single deploy click (same deployment row, no
   * duplicate DB insert - pg-boss redelivering the one job three times).
   * Queues that invoke a real build/provision need a ceiling long enough to
   * cover a slow first-time image pull, not just the common case.
   */
  expireInHours?: number;
}

async function ensureQueue(boss: PgBoss, name: string, options?: QueueOptions): Promise<void> {
  if (ensuredQueues.has(name)) return;
  if (options) {
    await boss.createQueue(name, { name, ...options });
    // createQueue is INSERT ... ON CONFLICT DO NOTHING - a queue created
    // before this option existed (or with different settings) needs an
    // explicit update to actually pick up the new expiry.
    await boss.updateQueue(name, { name, ...options });
  } else {
    await boss.createQueue(name);
  }
  ensuredQueues.add(name);
}

export interface EnqueueOptions {
  /** Delays a job's first pickup - used for poll-with-backoff patterns (e.g. re-checking ACME status). */
  startAfterSeconds?: number;
}

export async function enqueueJob(name: string, data: object, options?: EnqueueOptions): Promise<string | null> {
  const boss = await getBoss();
  await ensureQueue(boss, name);
  return boss.send(name, data, options?.startAfterSeconds ? { startAfter: options.startAfterSeconds } : {});
}

export async function registerJobWorker<T extends object>(
  name: string,
  handler: (data: T) => Promise<void>,
  queueOptions?: QueueOptions,
): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, name, queueOptions);
  await boss.work<T>(name, async (jobs) => {
    for (const job of jobs) {
      await handler(job.data);
    }
  });
}

/**
 * pg-boss's own cron poller (plain SQL + node-cron-parser, no Postgres
 * extension) - re-calling this with the same name is an upsert, so it's
 * safe to call unconditionally on every agent boot rather than tracking
 * whether it's "already" scheduled.
 */
export async function scheduleJob(name: string, cron: string, data: object = {}): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, name);
  await boss.schedule(name, cron, data);
}
