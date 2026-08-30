import { describe, expect, it, vi } from "vitest";

const inserted: any[] = [];

vi.mock("@openploy/db", () => ({
  auditLogs: { id: "id-column" },
}));

const { logAuditEvent } = await import("./audit");

function makeDbLike(): any {
  return {
    insert: vi.fn((table: any) => ({
      values: (values: any) => {
        inserted.push({ table, values });
        return Promise.resolve();
      },
    })),
  };
}

describe("logAuditEvent", () => {
  it("inserts a row with the given fields, defaulting an absent targetId to null", async () => {
    inserted.length = 0;
    const db = makeDbLike();

    await logAuditEvent(db, {
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "service.deleted",
      targetType: "service",
      targetId: "service-1",
      metadata: { name: "my-app" },
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(inserted[0].values).toEqual({
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "service.deleted",
      targetType: "service",
      targetId: "service-1",
      metadata: { name: "my-app" },
    });
  });

  it("defaults targetId to null when omitted", async () => {
    inserted.length = 0;
    const db = makeDbLike();

    await logAuditEvent(db, {
      organizationId: "org-1",
      actorUserId: null,
      action: "profile.password_change",
      targetType: "user",
    });

    expect(inserted[0].values.targetId).toBeNull();
    expect(inserted[0].values.actorUserId).toBeNull();
  });

  it("works against a transaction-like object too (only needs .insert)", async () => {
    inserted.length = 0;
    const tx = makeDbLike();

    await logAuditEvent(tx, {
      organizationId: "org-1",
      actorUserId: "user-1",
      action: "user.create",
      targetType: "user",
      targetId: "user-2",
    });

    expect(tx.insert).toHaveBeenCalledTimes(1);
  });
});
