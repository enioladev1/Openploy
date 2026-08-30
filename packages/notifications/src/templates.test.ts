import { describe, expect, it } from "vitest";
import { buildEmailHtml, buildEmailSubject, buildTelegramMessage, type NotificationContext } from "./templates";

function context(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    event: "deployment_success",
    serviceName: "api",
    projectName: "storefront",
    dashboardUrl: "https://openploy.example.com/projects/abc",
    ...overrides,
  };
}

describe("buildTelegramMessage", () => {
  it("includes the service name, project name, and dashboard link", () => {
    const message = buildTelegramMessage(context());
    expect(message).toContain("api");
    expect(message).toContain("storefront");
    expect(message).toContain("https://openploy.example.com/projects/abc");
  });

  it("shows the success emoji and subject for deployment_success", () => {
    const message = buildTelegramMessage(context({ event: "deployment_success" }));
    expect(message).toContain("✅");
    expect(message).toContain("Deployment succeeded");
  });

  it("shows the failure emoji and subject for deployment_failed", () => {
    const message = buildTelegramMessage(context({ event: "deployment_failed" }));
    expect(message).toContain("❌");
    expect(message).toContain("Deployment failed");
  });

  it("shows the failure emoji and subject for backup_failed", () => {
    const message = buildTelegramMessage(context({ event: "backup_failed" }));
    expect(message).toContain("❌");
    expect(message).toContain("Backup failed");
  });

  it("includes a duration line when durationSeconds is provided", () => {
    const message = buildTelegramMessage(context({ durationSeconds: 95 }));
    expect(message).toContain("Duration: 1m 35s");
  });

  it("omits the duration line entirely when durationSeconds is absent", () => {
    const message = buildTelegramMessage(context());
    expect(message).not.toContain("Duration:");
  });

  it("HTML-escapes service and project names so they can't break Telegram's HTML parse_mode", () => {
    const message = buildTelegramMessage(context({ serviceName: "<b>evil</b>", projectName: "a & b" }));
    expect(message).not.toContain("<b>evil</b>");
    expect(message).toContain("&lt;b&gt;evil&lt;/b&gt;");
    expect(message).toContain("a &amp; b");
  });

  it("never mentions an error message or failure reason", () => {
    const message = buildTelegramMessage(context({ event: "deployment_failed" }));
    expect(message.toLowerCase()).not.toContain("error");
    expect(message.toLowerCase()).not.toContain("reason");
  });
});

describe("buildEmailSubject", () => {
  it("includes the event subject and service name", () => {
    expect(buildEmailSubject(context({ event: "backup_success", serviceName: "primary-db" }))).toBe(
      "[Openploy] Backup succeeded: primary-db",
    );
  });
});

describe("buildEmailHtml", () => {
  it("includes the service name and project name", () => {
    const html = buildEmailHtml(context());
    expect(html).toContain("api");
    expect(html).toContain("storefront");
  });

  it("includes a duration row only when durationSeconds is provided", () => {
    const withDuration = buildEmailHtml(context({ durationSeconds: 42 }));
    expect(withDuration).toContain("Duration");
    expect(withDuration).toContain("42s");

    const withoutDuration = buildEmailHtml(context());
    expect(withoutDuration).not.toContain("Duration");
  });

  it("HTML-escapes service and project names", () => {
    const html = buildEmailHtml(context({ serviceName: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never includes any error message or failure reason content", () => {
    const html = buildEmailHtml(context({ event: "deployment_failed" }));
    expect(html.toLowerCase()).not.toContain("error");
    expect(html.toLowerCase()).not.toContain("failurereason");
  });

  it("links to the dashboard URL", () => {
    const html = buildEmailHtml(context({ dashboardUrl: "https://openploy.example.com/projects/xyz" }));
    expect(html).toContain('href="https://openploy.example.com/projects/xyz"');
  });
});
