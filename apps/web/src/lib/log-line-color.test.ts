import { describe, expect, it } from "vitest";
import { logLineColorClass } from "./log-line-color";

describe("logLineColorClass", () => {
  it("colors an error line red", () => {
    expect(logLineColorClass("Error: connection refused")).toBe("text-red-400");
  });

  it("colors a failed line red", () => {
    expect(logLineColorClass("npm run build FAILED")).toBe("text-red-400");
  });

  it("colors a warning line amber", () => {
    expect(logLineColorClass("Warning: deprecated flag used")).toBe("text-amber-400");
  });

  it("colors a success line green", () => {
    expect(logLineColorClass("Build completed successfully")).toBe("text-emerald-400");
  });

  it("falls back to the default light-gray for a plain line", () => {
    expect(logLineColorClass("Installing dependencies...")).toBe("text-zinc-100");
  });

  it("prefers error over warning when a line mentions both", () => {
    expect(logLineColorClass("treating warnings as errors")).toBe("text-red-400");
  });
});
