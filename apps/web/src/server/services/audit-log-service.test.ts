import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  rows: [] as any[],
  totalCount: 0,
  lastLimit: undefined as number | undefined,
  lastOffset: undefined as number | undefined,
};

vi.mock("@openploy/db", () => ({
  auditLogs: { organizationId: "org-id-column" },
  users: { id: "id-column" },
}));

vi.mock("../db", () => ({
  db: {
    // listAuditLogs runs two different select() shapes in parallel: the
    // joined page of rows, and a { count } aggregate - distinguished here by
    // whether the projection object has a "count" key.
    select: vi.fn((projection: any) => {
      if (projection && "count" in projection) {
        return {
          from: () => ({
            where: async () => [{ count: state.totalCount }],
          }),
        };
      }
      return {
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: (n: number) => {
                  state.lastLimit = n;
                  return {
                    offset: async (o: number) => {
                      state.lastOffset = o;
                      return state.rows;
                    },
                  };
                },
              }),
            }),
          }),
        }),
      };
    }),
  },
}));

const { listAuditLogs, AUDIT_LOG_PAGE_SIZE } = await import("./audit-log-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";

describe("listAuditLogs", () => {
  beforeEach(() => {
    state.rows = [];
    state.totalCount = 0;
    state.lastLimit = undefined;
    state.lastOffset = undefined;
  });

  it("returns the joined rows for the page along with pagination metadata", async () => {
    state.rows = [
      {
        id: "log-1",
        action: "user.create",
        targetType: "user",
        targetId: "user-1",
        metadata: { email: "ada@example.com" },
        createdAt: new Date("2026-01-01"),
        actorUserId: "owner-1",
        actorName: "Ada",
        actorEmail: "ada@example.com",
      },
    ];
    state.totalCount = 45;

    const result = await listAuditLogs(organizationId);
    expect(result.items).toEqual(state.rows);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(AUDIT_LOG_PAGE_SIZE);
    expect(result.totalCount).toBe(45);
    expect(result.totalPages).toBe(3); // ceil(45 / 20)
  });

  it("defaults to page 1 with a limit of 20 and no offset", async () => {
    await listAuditLogs(organizationId);
    expect(state.lastLimit).toBe(20);
    expect(state.lastOffset).toBe(0);
  });

  it("computes the offset for a later page", async () => {
    await listAuditLogs(organizationId, 3);
    expect(state.lastLimit).toBe(20);
    expect(state.lastOffset).toBe(40); // (3 - 1) * 20
  });

  it("reports at least 1 total page even when there are no rows", async () => {
    state.totalCount = 0;
    const result = await listAuditLogs(organizationId);
    expect(result.totalPages).toBe(1);
  });
});
