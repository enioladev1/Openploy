import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  user: null as any,
  emailLookup: null as any,
  txUpdates: [] as any[],
  txDeletes: [] as any[],
  txInserted: [] as any[],
};

const verifyPasswordMock = vi.fn(async (_hash: string, _plaintext: string) => true);
const hashPasswordMock = vi.fn(async (_plaintext: string) => "new-hashed-password");

vi.mock("@openploy/crypto", () => ({
  verifyPassword: (hash: string, plaintext: string) => verifyPasswordMock(hash, plaintext),
  hashPassword: (plaintext: string) => hashPasswordMock(plaintext),
}));

vi.mock("@openploy/db", () => ({
  users: { id: "id-column", email: "email-column" },
  sessions: { userId: "user-id-column", id: "id-column" },
  auditLogs: { id: "id-column" },
}));

let findFirstCallCount = 0;

function makeTx() {
  return {
    update: vi.fn((table: any) => ({
      set: (values: any) => ({
        where: () => {
          // Record here, not inside .returning() - changePassword's
          // tx.update().set().where() never chains .returning() at all.
          state.txUpdates.push({ table, values });
          const row = { ...state.user, ...values };
          return {
            returning: async () => [row],
            then: (resolve: any) => resolve(undefined),
          };
        },
      }),
    })),
    delete: vi.fn((table: any) => ({
      where: async () => {
        state.txDeletes.push({ table });
      },
    })),
    insert: vi.fn((table: any) => ({
      values: (values: any) => {
        state.txInserted.push({ table, values });
        return Promise.resolve();
      },
    })),
  };
}

vi.mock("../db", () => ({
  db: {
    query: {
      users: {
        // Every service function's first users.findFirst call is the "load by id"
        // lookup; updateProfile's optional second call is the email-uniqueness
        // check - order-based, not clause-inspection-based, since eq() from real
        // drizzle-orm doesn't stringify into anything reliably matchable here.
        findFirst: vi.fn(async () => {
          findFirstCallCount += 1;
          return findFirstCallCount === 1 ? state.user : state.emailLookup;
        }),
      },
    },
    transaction: async (fn: any) => fn(makeTx()),
  },
}));

const { changePassword, getProfile, updateProfile } = await import("./profile-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const userId = "018e5a3e-0000-7000-8000-000000000001";
const sessionId = "018e5a3e-0000-7000-8000-000000000002";

describe("profile-service", () => {
  beforeEach(() => {
    state.user = null;
    state.emailLookup = null;
    state.txUpdates = [];
    state.txDeletes = [];
    state.txInserted = [];
    findFirstCallCount = 0;
    verifyPasswordMock.mockClear();
    verifyPasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockClear();
  });

  describe("getProfile", () => {
    it("throws NotFoundError when the user doesn't exist", async () => {
      state.user = null;
      await expect(getProfile(userId)).rejects.toThrow("User not found");
    });

    it("returns the user's profile fields", async () => {
      state.user = { id: userId, name: "Ada Lovelace", email: "ada@example.com", totpEnabled: false, createdAt: new Date() };
      await expect(getProfile(userId)).resolves.toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });
    });
  });

  describe("updateProfile", () => {
    it("throws NotFoundError when the user doesn't exist", async () => {
      state.user = null;
      await expect(
        updateProfile(organizationId, userId, { name: "New Name", email: "new@example.com", currentPassword: "correct-password" }),
      ).rejects.toThrow("User not found");
    });

    it("throws AuthError when the current password is wrong", async () => {
      state.user = { id: userId, name: "Ada", email: "ada@example.com", passwordHash: "hash" };
      verifyPasswordMock.mockResolvedValue(false);
      await expect(
        updateProfile(organizationId, userId, { name: "New Name", email: "ada@example.com", currentPassword: "wrong" }),
      ).rejects.toThrow("Current password is incorrect");
    });

    it("throws ValidationError when the new email is already taken by someone else", async () => {
      state.user = { id: userId, name: "Ada", email: "ada@example.com", passwordHash: "hash" };
      state.emailLookup = { id: "someone-else" };
      await expect(
        updateProfile(organizationId, userId, { name: "Ada", email: "taken@example.com", currentPassword: "correct-password" }),
      ).rejects.toThrow("already in use");
    });

    it("updates name and email and audit-logs the change when the password is correct and email is free", async () => {
      state.user = { id: userId, name: "Ada", email: "ada@example.com", passwordHash: "hash" };
      state.emailLookup = null;
      const result = await updateProfile(organizationId, userId, {
        name: "Ada Byron",
        email: "ada.byron@example.com",
        currentPassword: "correct-password",
      });
      expect(result.name).toBe("Ada Byron");
      expect(result.email).toBe("ada.byron@example.com");
      expect(state.txUpdates).toHaveLength(1);
      expect(state.txInserted).toHaveLength(1);
      expect(state.txInserted[0].values).toMatchObject({
        action: "profile.update",
        metadata: { emailChanged: true, previousEmail: "ada@example.com", newEmail: "ada.byron@example.com" },
      });
    });

    it("allows saving without changing the email (no uniqueness check needed)", async () => {
      state.user = { id: userId, name: "Ada", email: "ada@example.com", passwordHash: "hash" };
      const result = await updateProfile(organizationId, userId, {
        name: "Ada B.",
        email: "ada@example.com",
        currentPassword: "correct-password",
      });
      expect(result.name).toBe("Ada B.");
      expect(state.txInserted[0].values).toMatchObject({ metadata: { emailChanged: false } });
    });
  });

  describe("changePassword", () => {
    it("throws NotFoundError when the user doesn't exist", async () => {
      state.user = null;
      await expect(
        changePassword(organizationId, userId, sessionId, { currentPassword: "old-password", newPassword: "a-new-strong-password" }),
      ).rejects.toThrow("User not found");
    });

    it("throws AuthError when the current password is wrong", async () => {
      state.user = { id: userId, passwordHash: "hash" };
      verifyPasswordMock.mockResolvedValue(false);
      await expect(
        changePassword(organizationId, userId, sessionId, { currentPassword: "wrong", newPassword: "a-new-strong-password" }),
      ).rejects.toThrow("Current password is incorrect");
    });

    it("updates the password hash, revokes every other session, and audit-logs it", async () => {
      state.user = { id: userId, passwordHash: "old-hash" };
      await changePassword(organizationId, userId, sessionId, {
        currentPassword: "old-password",
        newPassword: "a-new-strong-password",
      });

      expect(hashPasswordMock).toHaveBeenCalledWith("a-new-strong-password");
      expect(state.txUpdates).toEqual([{ table: expect.anything(), values: { passwordHash: "new-hashed-password" } }]);
      expect(state.txDeletes).toHaveLength(1);
      expect(state.txInserted).toHaveLength(1);
      expect(state.txInserted[0].values).toMatchObject({ action: "profile.password_change" });
    });
  });
});
