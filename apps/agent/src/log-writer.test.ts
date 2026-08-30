import { beforeEach, describe, expect, it, vi } from "vitest";

interface InsertedRow {
  deploymentId: string;
  stream: string;
  sequence: number;
  content: string;
}

const insertedRows: InsertedRow[] = [];
let maxSequenceToReturn = 0;

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => (maxSequenceToReturn > 0 ? [{ sequence: maxSequenceToReturn }] : [])),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (row: InsertedRow) => {
        insertedRows.push(row);
      }),
    })),
  },
}));

const { createLogWriter } = await import("./log-writer");

describe("createLogWriter", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    maxSequenceToReturn = 0;
  });

  it("returns the same writer instance for the same deploymentId", () => {
    const a = createLogWriter("dep-singleton", (s) => s);
    const b = createLogWriter("dep-singleton", (s) => s);
    expect(a).toBe(b);
  });

  it("assigns strictly increasing, non-colliding sequence numbers across interleaved build/runtime writes on the shared writer", async () => {
    const writer = createLogWriter("dep-interleaved", (s) => s);
    await writer.write("build", "line 1");
    await writer.write("runtime", "line 2");
    await writer.write("build", "line 3");

    const sequences = insertedRows.filter((r) => r.deploymentId === "dep-interleaved").map((r) => r.sequence);
    expect(sequences).toEqual([1, 2, 3]);
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it("resumes from the highest already-persisted sequence instead of colliding by restarting at 1", async () => {
    maxSequenceToReturn = 5;
    const writer = createLogWriter("dep-resumed", (s) => s);
    await writer.write("build", "line after a restart");

    const row = insertedRows.find((r) => r.deploymentId === "dep-resumed");
    expect(row?.sequence).toBe(6);
  });

  it("redacts content before persisting", async () => {
    const writer = createLogWriter("dep-redact", () => "[REDACTED]");
    await writer.write("build", "super secret value");

    const row = insertedRows.find((r) => r.deploymentId === "dep-redact");
    expect(row?.content).toBe("[REDACTED]");
  });
});
