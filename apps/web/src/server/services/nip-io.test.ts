import { describe, expect, it } from "vitest";
import { buildNipIoHost, slugify } from "./nip-io";

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric runs with a single hyphen", () => {
    expect(slugify("My Cool App!!")).toBe("my-cool-app");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--weird name--")).toBe("weird-name");
  });

  it("falls back to 'app' when nothing alphanumeric survives", () => {
    expect(slugify("!!!")).toBe("app");
  });

  it("truncates long names to keep the final DNS label under the 63-char limit", () => {
    const result = slugify("a".repeat(100));
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("buildNipIoHost", () => {
  it("builds a Openploy-style <slug>-<random>-<ip-dashed>.nip.io host", () => {
    expect(buildNipIoHost("n8n test", "169.58.147.50", "1be8da")).toBe("n8n-test-1be8da-169-58-147-50.nip.io");
  });

  it("produces a valid single DNS label before the nip.io suffix, even for a long service name", () => {
    const host = buildNipIoHost("a".repeat(100), "255.255.255.255", "abcdef");
    const firstLabel = host.replace(".nip.io", "");
    expect(firstLabel.length).toBeLessThanOrEqual(63);
    expect(firstLabel).toMatch(/^[a-z0-9-]+$/);
    expect(firstLabel.startsWith("-")).toBe(false);
    expect(firstLabel.endsWith("-")).toBe(false);
  });
});
