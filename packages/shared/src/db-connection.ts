export type DatabaseEngine = "postgres" | "mysql" | "redis" | "clickhouse" | "mongodb" | "mariadb";

// MariaDB is wire-compatible with MySQL - the same "mysql://" scheme is
// understood by every MySQL-protocol client/driver, and there's no
// universally-recognized "mariadb://" alternative to prefer instead.
const SCHEMES: Record<Exclude<DatabaseEngine, "redis">, string> = {
  postgres: "postgres",
  mysql: "mysql",
  mariadb: "mysql",
  clickhouse: "clickhouse",
  mongodb: "mongodb",
};

/** Single source of truth for connection-string formatting - used both for the reveal-to-user UI and for resolving a "linked variable" at deploy time, so the two never drift. */
export function buildDatabaseConnectionString(
  engine: DatabaseEngine,
  host: string,
  port: number,
  databaseName: string,
  username: string | null,
  password: string,
): string {
  if (engine === "redis") {
    // Redis has no username - just an optional password before the host.
    return `redis://:${password}@${host}:${port}`;
  }
  return `${SCHEMES[engine]}://${username}:${password}@${host}:${port}/${databaseName}`;
}
