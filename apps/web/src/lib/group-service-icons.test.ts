import { describe, expect, it } from "vitest";
import { groupServiceIcons } from "./group-service-icons";

describe("groupServiceIcons", () => {
  it("returns an empty array for no services", () => {
    expect(groupServiceIcons([])).toEqual([]);
  });

  it("keeps distinct types/engines as separate groups", () => {
    const result = groupServiceIcons([
      { id: "1", type: "application", engine: null, templateId: null },
      { id: "2", type: "database", engine: "redis", templateId: null },
      { id: "3", type: "database", engine: "mysql", templateId: null },
    ]);
    expect(result).toEqual([
      { type: "application", engine: null, templateId: null, count: 1 },
      { type: "database", engine: "redis", templateId: null, count: 1 },
      { type: "database", engine: "mysql", templateId: null, count: 1 },
    ]);
  });

  it("collapses multiple services with the same engine into one group with a count", () => {
    const result = groupServiceIcons([
      { id: "1", type: "database", engine: "redis", templateId: null },
      { id: "2", type: "database", engine: "redis", templateId: null },
    ]);
    expect(result).toEqual([{ type: "database", engine: "redis", templateId: null, count: 2 }]);
  });

  it("collapses multiple application services (no engine) into one group", () => {
    const result = groupServiceIcons([
      { id: "1", type: "application", engine: null, templateId: null },
      { id: "2", type: "application", engine: null, templateId: null },
      { id: "3", type: "application", engine: null, templateId: null },
    ]);
    expect(result).toEqual([{ type: "application", engine: null, templateId: null, count: 3 }]);
  });

  it("groups a template-deployed compose service by its template, not the generic compose type", () => {
    const result = groupServiceIcons([
      { id: "1", type: "compose", engine: null, templateId: "n8n" },
      { id: "2", type: "compose", engine: null, templateId: null },
    ]);
    expect(result).toEqual([
      { type: "compose", engine: null, templateId: "n8n", count: 1 },
      { type: "compose", engine: null, templateId: null, count: 1 },
    ]);
  });

  it("collapses two services deployed from the same template into one group", () => {
    const result = groupServiceIcons([
      { id: "1", type: "compose", engine: null, templateId: "n8n" },
      { id: "2", type: "compose", engine: null, templateId: "n8n" },
    ]);
    expect(result).toEqual([{ type: "compose", engine: null, templateId: "n8n", count: 2 }]);
  });
});
