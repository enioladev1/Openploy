import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  channels: [] as any[],
  serviceContext: null as any,
  enqueued: [] as Array<{ name: string; data: unknown }>,
  platformDomain: null as { host: string } | null,
};

vi.mock("./db", () => ({
  db: {
    query: {
      notificationChannels: {
        // Mirrors the real query's `eq(notificationChannels.isEnabled, true)` filter,
        // since this stub doesn't otherwise interpret the drizzle `where` clause.
        findMany: vi.fn(async () => state.channels.filter((channel) => channel.isEnabled)),
      },
      platformDomains: {
        findFirst: vi.fn(async () => state.platformDomain),
      },
    },
  },
}));

vi.mock("@openploy/db", () => ({
  notificationChannels: {
    organizationId: "org-id-column",
    isEnabled: "is-enabled-column",
  },
  getServiceNotificationContext: vi.fn(async () => state.serviceContext),
}));

const decryptSecretMock = vi.fn((value: any) => `decrypted(${value.cipherText})`);
vi.mock("@openploy/crypto", () => ({
  decryptSecret: (value: any) => decryptSecretMock(value),
}));

const sendTelegramMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
const sendSmtpEmailMock = vi.fn(async (..._args: unknown[]) => undefined);
const sendResendEmailMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@openploy/notifications", () => ({
  sendTelegramMessage: (...args: unknown[]) => sendTelegramMessageMock(...args),
  sendSmtpEmail: (...args: unknown[]) => sendSmtpEmailMock(...args),
  sendResendEmail: (...args: unknown[]) => sendResendEmailMock(...args),
  buildTelegramMessage: () => "telegram-message",
  buildEmailSubject: () => "email-subject",
  buildEmailHtml: () => "<html></html>",
}));

vi.mock("@openploy/queue", () => ({
  enqueueJob: vi.fn(async (name: string, data: unknown) => {
    state.enqueued.push({ name, data });
  }),
}));

const { dispatchNotification, notifyEvent, notifyServiceEvent } = await import("./notifications");
const { enqueueJob } = await import("@openploy/queue");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";

function telegramChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "channel-1",
    type: "telegram",
    isEnabled: true,
    notifyOnDeploymentSuccess: true,
    notifyOnDeploymentFailed: true,
    notifyOnBackupSuccess: true,
    notifyOnBackupFailed: true,
    telegramChatId: "chat-1",
    telegramBotTokenEncrypted: JSON.stringify({ cipherText: "token" }),
    ...overrides,
  };
}

describe("dispatchNotification", () => {
  beforeEach(() => {
    state.channels = [];
    decryptSecretMock.mockClear();
    sendTelegramMessageMock.mockClear();
    sendSmtpEmailMock.mockClear();
    sendResendEmailMock.mockClear();
  });

  it("sends to a channel subscribed to the event", async () => {
    state.channels = [telegramChannel()];
    await dispatchNotification(organizationId, "deployment_success", {
      serviceName: "api",
      projectName: "storefront",
      dashboardUrl: "https://example.com",
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith({ botToken: "decrypted(token)", chatId: "chat-1" }, "telegram-message");
  });

  it("skips a channel not subscribed to this event", async () => {
    state.channels = [telegramChannel({ notifyOnBackupFailed: false })];
    await dispatchNotification(organizationId, "backup_failed", {
      serviceName: "db",
      projectName: "storefront",
      dashboardUrl: "https://example.com",
    });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("skips a disabled channel even if subscribed to the event", async () => {
    state.channels = [telegramChannel({ isEnabled: false })];
    await dispatchNotification(organizationId, "deployment_success", {
      serviceName: "api",
      projectName: "storefront",
      dashboardUrl: "https://example.com",
    });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("one channel failing does not stop other channels from being sent", async () => {
    sendTelegramMessageMock.mockRejectedValueOnce(new Error("bad token"));
    state.channels = [telegramChannel({ id: "channel-a" }), telegramChannel({ id: "channel-b" })];

    await expect(
      dispatchNotification(organizationId, "deployment_success", {
        serviceName: "api",
        projectName: "storefront",
        dashboardUrl: "https://example.com",
      }),
    ).resolves.toBeUndefined();

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(2);
  });
});

describe("notifyEvent", () => {
  beforeEach(() => {
    state.enqueued = [];
    vi.mocked(enqueueJob).mockClear();
  });

  it("enqueues a dispatch-notification job", async () => {
    await notifyEvent(organizationId, "deployment_failed", {
      serviceName: "api",
      projectName: "storefront",
      dashboardUrl: "https://example.com",
    });
    expect(state.enqueued).toEqual([
      {
        name: "dispatch-notification",
        data: {
          organizationId,
          event: "deployment_failed",
          context: { serviceName: "api", projectName: "storefront", dashboardUrl: "https://example.com" },
        },
      },
    ]);
  });

  it("swallows an enqueue failure instead of throwing", async () => {
    vi.mocked(enqueueJob).mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(
      notifyEvent(organizationId, "deployment_failed", {
        serviceName: "api",
        projectName: "storefront",
        dashboardUrl: "https://example.com",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("notifyServiceEvent", () => {
  beforeEach(() => {
    state.enqueued = [];
    state.serviceContext = null;
    state.platformDomain = null;
  });

  it("resolves org/project/service and enqueues with a dashboard link", async () => {
    state.serviceContext = { organizationId, projectId: "project-1", projectName: "storefront", serviceName: "api" };

    await notifyServiceEvent("service-1", "deployment_success", { durationSeconds: 12 });

    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0]?.data).toMatchObject({
      organizationId,
      event: "deployment_success",
      context: { serviceName: "api", projectName: "storefront", durationSeconds: 12 },
    });
  });

  it("does nothing when the service cannot be resolved", async () => {
    state.serviceContext = null;
    await notifyServiceEvent("missing-service", "deployment_failed");
    expect(state.enqueued).toEqual([]);
  });

  it("builds the dashboard link from the configured platform domain, not APP_BASE_URL", async () => {
    state.serviceContext = { organizationId, projectId: "project-1", projectName: "storefront", serviceName: "api" };
    state.platformDomain = { host: "dashboard.example.com" };
    process.env.APP_BASE_URL = "https://install-time-domain.nip.io";

    await notifyServiceEvent("service-1", "deployment_success");

    expect(state.enqueued[0]?.data).toMatchObject({
      context: { dashboardUrl: "https://dashboard.example.com/projects/project-1" },
    });
  });

  it("falls back to APP_BASE_URL when no platform domain is configured yet", async () => {
    state.serviceContext = { organizationId, projectId: "project-1", projectName: "storefront", serviceName: "api" };
    state.platformDomain = null;
    process.env.APP_BASE_URL = "https://install-time-domain.nip.io";

    await notifyServiceEvent("service-1", "deployment_success");

    expect(state.enqueued[0]?.data).toMatchObject({
      context: { dashboardUrl: "https://install-time-domain.nip.io/projects/project-1" },
    });
  });
});
