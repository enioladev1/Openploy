import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatZodError } from "./format-zod-error";

describe("formatZodError", () => {
  it("returns null for a non-ZodError cause", () => {
    expect(formatZodError(new Error("boom"))).toBeNull();
    expect(formatZodError(undefined)).toBeNull();
    expect(formatZodError("plain string")).toBeNull();
  });

  it("returns a single issue's own message, not the raw stringified issues array", () => {
    const schema = z.object({ name: z.string().min(1, "Name is required") });
    const result = schema.safeParse({ name: "" });
    if (result.success) throw new Error("expected failure");

    expect(formatZodError(result.error)).toBe("Name is required");
  });

  it("joins multiple issues with a separator so every field's problem is visible", () => {
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      age: z.number().min(0, "Age must be non-negative"),
    });
    const result = schema.safeParse({ name: "", age: -1 });
    if (result.success) throw new Error("expected failure");

    expect(formatZodError(result.error)).toBe("Name is required; Age must be non-negative");
  });
});
