import { describe, expect, it } from "vitest";
import { buildDatabaseConnectionString } from "./db-connection";

describe("buildDatabaseConnectionString", () => {
  it("builds a postgres:// connection string", () => {
    expect(buildDatabaseConnectionString("postgres", "db-1", 5432, "app", "app_user", "pw")).toBe(
      "postgres://app_user:pw@db-1:5432/app",
    );
  });

  it("builds a mysql:// connection string", () => {
    expect(buildDatabaseConnectionString("mysql", "db-1", 3306, "app", "app_user", "pw")).toBe(
      "mysql://app_user:pw@db-1:3306/app",
    );
  });

  it("builds a mariadb connection string using the mysql:// scheme (wire-compatible)", () => {
    expect(buildDatabaseConnectionString("mariadb", "db-1", 3306, "app", "app_user", "pw")).toBe(
      "mysql://app_user:pw@db-1:3306/app",
    );
  });

  it("builds a clickhouse:// connection string", () => {
    expect(buildDatabaseConnectionString("clickhouse", "db-1", 9000, "app", "app_user", "pw")).toBe(
      "clickhouse://app_user:pw@db-1:9000/app",
    );
  });

  it("builds a mongodb:// connection string", () => {
    expect(buildDatabaseConnectionString("mongodb", "db-1", 27017, "app", "app_user", "pw")).toBe(
      "mongodb://app_user:pw@db-1:27017/app",
    );
  });

  it("builds a redis:// connection string with no username", () => {
    expect(buildDatabaseConnectionString("redis", "db-1", 6379, "openploy", null, "pw")).toBe("redis://:pw@db-1:6379");
  });
});
