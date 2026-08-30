import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { branchFromRef, parsePushEvent, verifyWebhookSignature } from "./webhook";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ hello: "world" });

  it("accepts a correctly signed payload", () => {
    expect(verifyWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"), secret)).toBe(false);
  });

  it("rejects a tampered body even if a valid-looking signature is attached", () => {
    const signatureForOriginal = sign(body, secret);
    const tamperedBody = JSON.stringify({ hello: "world", admin: true });
    expect(verifyWebhookSignature(tamperedBody, signatureForOriginal, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects a malformed signature header without the sha256= prefix", () => {
    expect(verifyWebhookSignature(body, "not-a-real-signature", secret)).toBe(false);
  });
});

describe("branchFromRef", () => {
  it("extracts the branch name from a refs/heads/ ref", () => {
    expect(branchFromRef("refs/heads/main")).toBe("main");
    expect(branchFromRef("refs/heads/feature/x")).toBe("feature/x");
  });

  it("returns null for a tag ref", () => {
    expect(branchFromRef("refs/tags/v1.0.0")).toBeNull();
  });
});

describe("parsePushEvent", () => {
  it("extracts the fields we act on from a push payload", () => {
    const payload = {
      ref: "refs/heads/main",
      installation: { id: 12345 },
      repository: { full_name: "acme/web", name: "web", owner: { login: "acme" } },
      head_commit: { id: "abc123", message: "fix bug", author: { name: "Jane" } },
    };

    const event = parsePushEvent(JSON.stringify(payload));
    expect(event).toEqual({
      ref: "refs/heads/main",
      installationId: "12345",
      repoFullName: "acme/web",
      repoOwner: "acme",
      repoName: "web",
      headCommitSha: "abc123",
      headCommitMessage: "fix bug",
      headCommitAuthor: "Jane",
    });
  });
});
