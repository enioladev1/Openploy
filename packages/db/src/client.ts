import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Single shared connection pool per process. Both apps/web and apps/agent
 * import this rather than opening their own pools.
 */
export function getDb() {
  if (cachedDb) return cachedDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
  });
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
