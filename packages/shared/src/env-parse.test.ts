import { describe, expect, it } from "vitest";
import { formatEnvFileText, parseEnvFileText } from "./env-parse";

describe("parseEnvFileText", () => {
  it("parses simple KEY=VALUE lines", () => {
    expect(parseEnvFileText("FOO=bar\nBAZ=qux")).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("skips blank lines and comment lines", () => {
    const text = "FOO=bar\n\n# a comment\nBAZ=qux\n";
    expect(parseEnvFileText(text)).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("only splits on the first = so values may contain =", () => {
    expect(parseEnvFileText("CONN=postgres://user:pass@host/db?sslmode=require")).toEqual([
      { key: "CONN", value: "postgres://user:pass@host/db?sslmode=require" },
    ]);
  });

  it("strips matching surrounding quotes from the value", () => {
    expect(parseEnvFileText('FOO="bar baz"\nBAR=\'single quoted\'')).toEqual([
      { key: "FOO", value: "bar baz" },
      { key: "BAR", value: "single quoted" },
    ]);
  });

  it("does not strip mismatched quotes", () => {
    expect(parseEnvFileText(`FOO="bar'`)).toEqual([{ key: "FOO", value: `"bar'` }]);
  });

  it("trims whitespace around key and value", () => {
    expect(parseEnvFileText("  FOO  =  bar  ")).toEqual([{ key: "FOO", value: "bar" }]);
  });

  it("skips a line with no = at all", () => {
    expect(parseEnvFileText("FOO=bar\nnotanenvline\nBAZ=qux")).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("allows an empty value", () => {
    expect(parseEnvFileText("FOO=")).toEqual([{ key: "FOO", value: "" }]);
  });

  it("returns an empty array for empty or all-comment input", () => {
    expect(parseEnvFileText("")).toEqual([]);
    expect(parseEnvFileText("# just a comment\n# another")).toEqual([]);
  });
});

describe("formatEnvFileText", () => {
  it("round-trips through parseEnvFileText", () => {
    const entries = [
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ];
    expect(parseEnvFileText(formatEnvFileText(entries))).toEqual(entries);
  });
});
