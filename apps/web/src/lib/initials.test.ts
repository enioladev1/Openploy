import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("returns first and last initial for a two-word name", () => {
    expect(initialsOf("Eniola Dev")).toBe("ED");
  });

  it("returns just the first initial for a single-word name", () => {
    expect(initialsOf("Eniola")).toBe("E");
  });

  it("uses the first and last words for a three-or-more-word name", () => {
    expect(initialsOf("Ada Lovelace Byron")).toBe("AB");
  });

  it("uppercases lowercase input", () => {
    expect(initialsOf("jane doe")).toBe("JD");
  });

  it("collapses extra whitespace", () => {
    expect(initialsOf("  Jane   Doe  ")).toBe("JD");
  });

  it("falls back to a question mark for an empty name", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
