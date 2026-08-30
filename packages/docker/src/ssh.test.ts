import { describe, expect, it } from "vitest";
import { isBlockedTarget } from "./ssh";

describe("isBlockedTarget", () => {
  it("blocks the cloud metadata IP regardless of the private-network flag", () => {
    expect(isBlockedTarget("169.254.169.254", false)).toBe(true);
    expect(isBlockedTarget("169.254.169.254", true)).toBe(true);
  });

  it("blocks loopback addresses", () => {
    expect(isBlockedTarget("127.0.0.1", false)).toBe(true);
  });

  it("blocks RFC1918 private ranges by default", () => {
    expect(isBlockedTarget("10.0.0.5", false)).toBe(true);
    expect(isBlockedTarget("172.16.0.5", false)).toBe(true);
    expect(isBlockedTarget("192.168.1.5", false)).toBe(true);
  });

  it("allows RFC1918 ranges when the caller explicitly opts in", () => {
    expect(isBlockedTarget("10.0.0.5", true)).toBe(false);
    expect(isBlockedTarget("192.168.1.5", true)).toBe(false);
  });

  it("allows a public IP", () => {
    expect(isBlockedTarget("203.0.113.10", false)).toBe(false);
  });

  it("does not block a hostname (DNS resolution is a separate hardening concern)", () => {
    expect(isBlockedTarget("my-server.example.com", false)).toBe(false);
  });

  it("does not falsely block a public IP that merely starts with a private-range octet pattern out of range", () => {
    expect(isBlockedTarget("172.32.0.1", false)).toBe(false); // 172.32 is outside the 172.16-172.31 private block
  });
});
