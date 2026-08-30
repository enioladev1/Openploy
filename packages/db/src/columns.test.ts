import { getTableColumns } from "drizzle-orm";
import { pgTable, varchar } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { id, timestamps } from "./columns";

describe("column helpers", () => {
  const testTable = pgTable("test_table", {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    ...timestamps(),
  });

  it("id() produces a uuid primary key column", () => {
    const columns = getTableColumns(testTable);
    expect(columns.id.primary).toBe(true);
    expect(columns.id.dataType).toBe("string");
  });

  it("id() generates a fresh UUIDv7 per row via $defaultFn", () => {
    const columns = getTableColumns(testTable);
    const a = columns.id.defaultFn?.();
    const b = columns.id.defaultFn?.();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("timestamps() adds not-null createdAt/updatedAt columns", () => {
    const columns = getTableColumns(testTable);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });
});
