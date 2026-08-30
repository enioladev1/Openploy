import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  channel: null as any,
  listRows: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
  selectRows: [] as any[],
};

const encryptSecretMock = vi.fn((value: string) => ({ cipherText: `enc(${value})` }));
const decryptSecretMock = vi.fn((value: any) => value.cipherText?.replace(/^enc\(|\)$/g, "") ?? "decrypted");

vi.mock("@openploy/crypto", () => ({
  encryptSecret: (value: string) => encryptSecretMock(value),
  decryptSecret: (value: any) => decryptSecretMock(value),
}));

const testNotificationConnectionMock = vi.fn(async (_config: unknown, _baseUrl: string) => undefined);
vi.mock("@openploy/notifications", () => ({
  testNotificationConnection: (config: unknown, baseUrl: string) => testNotificationConnectionMock(config, baseUrl),
}));

vi.mock("@openploy/db", () => ({
  notificationChannels: { id: "id-column", organizationId: "org-id-column" },
  platformDomains: { id: "id-column" },
  certificates: { id: "id-column" },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      notificationChannels: {
        findFirst: vi.fn(async () => state.channel),
        findMany: vi.fn(async () => state.listRows),
      },
    },
    // getEffectiveBaseUrl -> getPlatformDomain reads through this chain, not .query.
    select: vi.fn(() => ({
      from: () => ({
        leftJoin: () => ({
          limit: async () => state.selectRows,
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (values: any) => ({
        returning: async () => {
          const row = { id: "new-channel-id", ...values };
          state.inserted.push(values);
          return [row];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: () => {
          state.updates.push(values);
          const row = { id: "updated-channel-id", ...values };
          return { returning: async () => [row], then: (resolve: any) => resolve(undefined) };
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => {
        state.deletes.push(true);
      },
    })),
  },
}));

const {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  testNotificationConfig,
  testSavedNotificationChannel,
  updateNotificationChannel,
} = await import("./notification-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const channelId = "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";

describe("notification-service", () => {
  beforeEach(() => {
    state.channel = null;
    state.listRows = [];
    state.inserted = [];
    state.updates = [];
    state.deletes = [];
    state.selectRows = [{ id: "domain-1", host: "dashboard.example.com", certificateId: null, certificateStatus: null }];
    encryptSecretMock.mockClear();
    decryptSecretMock.mockClear();
    testNotificationConnectionMock.mockClear();
  });

  describe("createNotificationChannel", () => {
    it("encrypts the telegram bot token and stores the chat id in the clear", async () => {
      const row = await createNotificationChannel(organizationId, {
        name: "Ops alerts",
        config: { kind: "telegram", botToken: "secret-token", chatId: "12345" },
        notifyOnDeploymentSuccess: false,
        notifyOnDeploymentFailed: true,
        notifyOnBackupSuccess: false,
        notifyOnBackupFailed: true,
      });

      expect(row.organizationId).toBe(organizationId);
      expect(encryptSecretMock).toHaveBeenCalledWith("secret-token");
      expect(state.inserted[0]).toMatchObject({
        type: "telegram",
        telegramChatId: "12345",
        telegramBotTokenEncrypted: JSON.stringify({ cipherText: "enc(secret-token)" }),
        smtpHost: null,
        resendApiKeyEncrypted: null,
      });
    });

    it("encrypts the SMTP password", async () => {
      await createNotificationChannel(organizationId, {
        name: "Email alerts",
        config: {
          kind: "smtp",
          host: "smtp.example.com",
          port: 587,
          secure: false,
          username: "user",
          password: "hunter2",
          fromEmail: "alerts@example.com",
          fromName: "Openploy",
          toEmail: "ops@example.com",
        },
        notifyOnDeploymentSuccess: false,
        notifyOnDeploymentFailed: true,
        notifyOnBackupSuccess: false,
        notifyOnBackupFailed: true,
      });

      expect(encryptSecretMock).toHaveBeenCalledWith("hunter2");
      expect(state.inserted[0].smtpPasswordEncrypted).toBe(JSON.stringify({ cipherText: "enc(hunter2)" }));
    });
  });

  describe("updateNotificationChannel", () => {
    it("throws NotFoundError when the channel isn't in the caller's org", async () => {
      state.channel = null;
      await expect(
        updateNotificationChannel(organizationId, {
          id: channelId,
          name: "Renamed",
          isEnabled: true,
          config: { kind: "telegram", chatId: "1", botToken: undefined },
          notifyOnDeploymentSuccess: false,
          notifyOnDeploymentFailed: true,
          notifyOnBackupSuccess: false,
          notifyOnBackupFailed: true,
        }),
      ).rejects.toThrow("Notification channel not found");
    });

    it("keeps the existing encrypted bot token when the secret field is left blank", async () => {
      state.channel = {
        id: channelId,
        organizationId,
        type: "telegram",
        telegramChatId: "old-chat",
        telegramBotTokenEncrypted: "existing-encrypted-value",
      };

      await updateNotificationChannel(organizationId, {
        id: channelId,
        name: "Ops alerts",
        isEnabled: true,
        config: { kind: "telegram", chatId: "new-chat", botToken: undefined },
        notifyOnDeploymentSuccess: false,
        notifyOnDeploymentFailed: true,
        notifyOnBackupSuccess: false,
        notifyOnBackupFailed: true,
      });

      expect(encryptSecretMock).not.toHaveBeenCalled();
      expect(state.updates[0]).toMatchObject({
        telegramChatId: "new-chat",
        telegramBotTokenEncrypted: "existing-encrypted-value",
      });
    });

    it("re-encrypts when a new secret is provided", async () => {
      state.channel = {
        id: channelId,
        organizationId,
        type: "telegram",
        telegramChatId: "old-chat",
        telegramBotTokenEncrypted: "existing-encrypted-value",
      };

      await updateNotificationChannel(organizationId, {
        id: channelId,
        name: "Ops alerts",
        isEnabled: true,
        config: { kind: "telegram", chatId: "new-chat", botToken: "brand-new-token" },
        notifyOnDeploymentSuccess: false,
        notifyOnDeploymentFailed: true,
        notifyOnBackupSuccess: false,
        notifyOnBackupFailed: true,
      });

      expect(encryptSecretMock).toHaveBeenCalledWith("brand-new-token");
      expect(state.updates[0].telegramBotTokenEncrypted).toBe(JSON.stringify({ cipherText: "enc(brand-new-token)" }));
    });

    it("rejects switching type without a new secret, since there is nothing stored to keep", async () => {
      state.channel = {
        id: channelId,
        organizationId,
        type: "telegram",
        telegramChatId: "old-chat",
        telegramBotTokenEncrypted: "existing-encrypted-value",
      };

      await expect(
        updateNotificationChannel(organizationId, {
          id: channelId,
          name: "Ops alerts",
          isEnabled: true,
          config: {
            kind: "smtp",
            host: "smtp.example.com",
            port: 587,
            secure: false,
            username: "user",
            password: undefined,
            fromEmail: "a@b.com",
            fromName: "Openploy",
            toEmail: "ops@b.com",
          },
          notifyOnDeploymentSuccess: false,
          notifyOnDeploymentFailed: true,
          notifyOnBackupSuccess: false,
          notifyOnBackupFailed: true,
        }),
      ).rejects.toThrow("Password is required");
    });
  });

  describe("listNotificationChannels", () => {
    it("returns the rows for the org", async () => {
      state.listRows = [{ id: channelId, name: "Ops alerts" }];
      await expect(listNotificationChannels(organizationId)).resolves.toEqual(state.listRows);
    });
  });

  describe("deleteNotificationChannel", () => {
    it("throws NotFoundError when the channel doesn't exist", async () => {
      await expect(deleteNotificationChannel(organizationId, channelId)).rejects.toThrow("Notification channel not found");
    });

    it("deletes when the channel belongs to the org", async () => {
      state.channel = { id: channelId, organizationId };
      await deleteNotificationChannel(organizationId, channelId);
      expect(state.deletes).toHaveLength(1);
    });
  });

  describe("testNotificationConfig", () => {
    it("calls through to the notifications package with the effective base URL", async () => {
      const config = { kind: "telegram" as const, botToken: "t", chatId: "c" };
      await testNotificationConfig(config);
      expect(testNotificationConnectionMock).toHaveBeenCalledWith(config, "https://dashboard.example.com");
    });
  });

  describe("testSavedNotificationChannel", () => {
    it("decrypts the stored secret, tests it, and persists success", async () => {
      state.channel = {
        id: channelId,
        organizationId,
        type: "telegram",
        telegramChatId: "chat-1",
        telegramBotTokenEncrypted: JSON.stringify({ cipherText: "enc(stored-token)" }),
      };

      const result = await testSavedNotificationChannel(organizationId, channelId);

      expect(decryptSecretMock).toHaveBeenCalled();
      expect(testNotificationConnectionMock).toHaveBeenCalledWith(
        { kind: "telegram", chatId: "chat-1", botToken: "stored-token" },
        "https://dashboard.example.com",
      );
      expect(result).toEqual({ success: true });
      expect(state.updates[0]).toMatchObject({ lastTestStatus: "success", lastTestError: null });
    });

    it("persists failure with the error message when the send fails", async () => {
      state.channel = {
        id: channelId,
        organizationId,
        type: "telegram",
        telegramChatId: "chat-1",
        telegramBotTokenEncrypted: JSON.stringify({ cipherText: "enc(stored-token)" }),
      };
      testNotificationConnectionMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await testSavedNotificationChannel(organizationId, channelId);

      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(state.updates[0]).toMatchObject({ lastTestStatus: "failed", lastTestError: "Unauthorized" });
    });
  });
});
