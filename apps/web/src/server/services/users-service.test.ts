import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  emailLookup: null as any,
  membership: null as any,
  selectRows: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
};

const hashPasswordMock = vi.fn(async (_plaintext: string) => "hashed-password");

vi.mock("@openploy/crypto", () => ({
  hashPassword: (plaintext: string) => hashPasswordMock(plaintext),
}));

vi.mock("@openploy/db", () => ({
  users: { id: "id-column", email: "email-column" },
  organizationMembers: { organizationId: "org-id-column", userId: "user-id-column", role: "role-column", createdAt: "created-at-column" },
  auditLogs: { id: "id-column" },
}));

function makeTx() {
  return {
    // Real code doesn't always chain .returning() (the organizationMembers
    // and auditLogs inserts don't need the row back) - record on .values()
    // itself so both call shapes are captured, not only ones awaiting .returning().
    insert: vi.fn((table: any) => ({
      values: (values: any) => {
        const row = { id: "new-user-id", createdAt: new Date("2026-01-01"), ...values };
        state.inserted.push({ table, values, row });
        return { returning: async () => [row] };
      },
    })),
    update: vi.fn((table: any) => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push({ table, values });
        },
      }),
    })),
    delete: vi.fn((table: any) => ({
      where: async () => {
        state.deletes.push({ table });
      },
    })),
  };
}

vi.mock("../db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn(async () => state.emailLookup) },
      organizationMembers: { findFirst: vi.fn(async () => state.membership) },
    },
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: async () => state.selectRows,
          }),
        }),
      }),
    })),
    transaction: async (fn: any) => fn(makeTx()),
  },
}));

const { createUser, listUsers, removeUser, updateUserRole } = await import("./users-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const callerUserId = "018e5a3e-0000-7000-8000-000000000001";
const targetUserId = "018e5a3e-0000-7000-8000-000000000002";

describe("users-service", () => {
  beforeEach(() => {
    state.emailLookup = null;
    state.membership = null;
    state.selectRows = [];
    state.inserted = [];
    state.updates = [];
    state.deletes = [];
    hashPasswordMock.mockClear();
  });

  describe("listUsers", () => {
    it("returns the joined rows for the organization", async () => {
      state.selectRows = [{ id: targetUserId, name: "Ada", email: "ada@example.com", role: "member", createdAt: new Date() }];
      await expect(listUsers(organizationId)).resolves.toEqual(state.selectRows);
    });
  });

  describe("createUser", () => {
    it("throws ValidationError when the email is already in use", async () => {
      state.emailLookup = { id: "someone-else" };
      await expect(
        createUser(organizationId, callerUserId, {
          name: "Ada",
          email: "taken@example.com",
          password: "a-strong-password-1",
          role: "member",
        }),
      ).rejects.toThrow("already in use");
    });

    it("hashes the password, creates the user with the given role, and audit-logs it", async () => {
      state.emailLookup = null;
      const result = await createUser(organizationId, callerUserId, {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "a-strong-password-1",
        role: "admin",
      });

      expect(hashPasswordMock).toHaveBeenCalledWith("a-strong-password-1");
      expect(result.role).toBe("admin");
      expect(result.email).toBe("ada@example.com");
      expect(state.inserted).toHaveLength(3); // users row, organizationMembers row, auditLogs row
      expect(state.inserted[2].values).toMatchObject({ action: "user.create", actorUserId: callerUserId });
    });
  });

  describe("updateUserRole", () => {
    it("throws NotFoundError when the target user isn't a member of this org", async () => {
      state.membership = null;
      await expect(updateUserRole(organizationId, callerUserId, targetUserId, "admin")).rejects.toThrow("User not found");
    });

    it("throws ForbiddenError when trying to change the owner's role", async () => {
      state.membership = { organizationId, userId: targetUserId, role: "owner" };
      await expect(updateUserRole(organizationId, callerUserId, targetUserId, "admin")).rejects.toThrow(
        "owner's role can't be changed",
      );
    });

    it("throws ForbiddenError when trying to change your own role", async () => {
      state.membership = { organizationId, userId: callerUserId, role: "admin" };
      await expect(updateUserRole(organizationId, callerUserId, callerUserId, "member")).rejects.toThrow(
        "can't change your own role",
      );
    });

    it("updates the role and audit-logs it when everything checks out", async () => {
      state.membership = { organizationId, userId: targetUserId, role: "member" };
      await updateUserRole(organizationId, callerUserId, targetUserId, "admin");
      expect(state.updates).toEqual([{ table: expect.anything(), values: { role: "admin" } }]);
      expect(state.inserted).toHaveLength(1);
      expect(state.inserted[0].values).toMatchObject({ action: "user.role_change", metadata: { from: "member", to: "admin" } });
    });
  });

  describe("removeUser", () => {
    it("throws NotFoundError when the target user isn't a member of this org", async () => {
      state.membership = null;
      await expect(removeUser(organizationId, callerUserId, targetUserId)).rejects.toThrow("User not found");
    });

    it("throws ForbiddenError when trying to remove the owner", async () => {
      state.membership = { organizationId, userId: targetUserId, role: "owner" };
      await expect(removeUser(organizationId, callerUserId, targetUserId)).rejects.toThrow("owner can't be removed");
    });

    it("throws ForbiddenError when trying to remove yourself", async () => {
      state.membership = { organizationId, userId: callerUserId, role: "admin" };
      await expect(removeUser(organizationId, callerUserId, callerUserId)).rejects.toThrow("can't remove your own account");
    });

    it("deletes the user and audit-logs it when everything checks out", async () => {
      state.membership = { organizationId, userId: targetUserId, role: "member" };
      await removeUser(organizationId, callerUserId, targetUserId);
      expect(state.deletes).toHaveLength(1);
      expect(state.inserted).toHaveLength(1);
      expect(state.inserted[0].values).toMatchObject({ action: "user.remove" });
    });
  });
});
