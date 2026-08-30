import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  orgCount: 0,
  existingUser: null as any,
  insertedUsers: [] as any[],
  insertedOrgs: [] as any[],
};

vi.mock("@openploy/crypto", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed(${password})`),
  generateSessionToken: vi.fn(() => "dummy-token"),
}));

vi.mock("@openploy/db", () => ({
  organizationMembers: {},
  organizations: {},
  sessions: {},
  users: { email: "email-column" },
}));

const enqueueJobMock = vi.fn(async (..._args: unknown[]) => "job-id");
vi.mock("@openploy/queue", () => ({ enqueueJob: (...args: unknown[]) => enqueueJobMock(...args) }));

vi.mock("../db", () => ({
  db: {
    $count: vi.fn(async () => state.orgCount),
    query: {
      users: { findFirst: vi.fn(async () => state.existingUser) },
    },
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      let call = 0;
      const tx = {
        insert: vi.fn(() => ({
          values: (values: any) => ({
            returning: async () => {
              call += 1;
              if (call === 1) {
                const row = { id: "user-1", ...values };
                state.insertedUsers.push(row);
                return [row];
              }
              if (call === 2) {
                const row = { id: "org-1", ...values };
                state.insertedOrgs.push(row);
                return [row];
              }
              return [{ id: "member-1", ...values }];
            },
          }),
        })),
      };
      return callback(tx);
    }),
  },
}));

const { signupInitialAdmin } = await import("./auth-service");

const signupInput = { email: "admin@example.com", password: "a-strong-password", name: "Admin" };

describe("signupInitialAdmin", () => {
  beforeEach(() => {
    state.orgCount = 0;
    state.existingUser = null;
    state.insertedUsers = [];
    state.insertedOrgs = [];
    enqueueJobMock.mockClear();
  });

  it("creates the user/org and enqueues the ACME email job with the signup email", async () => {
    const result = await signupInitialAdmin(signupInput);

    expect(result).toEqual({ userId: "user-1", organizationId: "org-1" });
    expect(enqueueJobMock).toHaveBeenCalledWith("set-acme-email", { email: "admin@example.com" });
  });

  it("throws when the instance is already set up", async () => {
    state.orgCount = 1;
    await expect(signupInitialAdmin(signupInput)).rejects.toThrow("already set up");
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("still returns successfully even if enqueuing the ACME email job fails", async () => {
    enqueueJobMock.mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(signupInitialAdmin(signupInput)).resolves.toEqual({ userId: "user-1", organizationId: "org-1" });
  });
});
