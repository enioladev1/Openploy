import { describe, expect, it } from "vitest";
import { groupServiceIcons } from "./group-service-icons";

describe("groupServiceIcons", () => {
  it("returns an empty array for no services", () => {
    expect(groupServiceIcons([])).toEqual([]);
  });

  it("keeps distinct types/engines as separate groups", () => {
    const result = groupServiceIcons([
      { id: "1", type: "application", engine: null },
      { id: "2", type: "database", engine: "redis" },
      { id: "3", type: "database", engine: "mysql" },
    ]);
    expect(result).toEqual([
      { type: "application", engine: null, count: 1 },
      { type: "database", engine: "redis", count: 1 },
      { type: "database", engine: "mysql", count: 1 },
    ]);
  });

  it("collapses multiple services with the same engine into one group with a count", () => {
    const result = groupServiceIcons([
      { id: "1", type: "database", engine: "redis" },
      { id: "2", type: "database", engine: "redis" },
    ]);
    expect(result).toEqual([{ type: "database", engine: "redis", count: 2 }]);
  });

  it("collapses multiple application services (no engine) into one group", () => {
    const result = groupServiceIcons([
      { id: "1", type: "application", engine: null },
      { id: "2", type: "application", engine: null },
      { id: "3", type: "application", engine: null },
    ]);
    expect(result).toEqual([{ type: "application", engine: null, count: 3 }]);
  });
});
