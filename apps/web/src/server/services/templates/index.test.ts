import { describe, expect, it } from "vitest";
import { interpolateComposeVariables, normalizeForSwarm, parseComposeYaml, validateComposeSafety } from "@openploy/compose";
import { getTemplateDefinition } from "./index";
import { excalidrawTemplate } from "./excalidraw";
import { n8nTemplate } from "./n8n";
import { phpmyadminTemplate } from "./phpmyadmin";

const TEMPLATES = [n8nTemplate, phpmyadminTemplate, excalidrawTemplate];

function dummyValueFor(value: (typeof n8nTemplate.envVars)[number]["value"]): string {
  switch (value.type) {
    case "fixed":
      return value.value;
    case "empty":
      return "";
    case "domainHost":
      return "n8n-abc123-1-2-3-4.nip.io";
    case "generatedSecret":
      return "deadbeef";
  }
}

describe("template compose files", () => {
  for (const template of TEMPLATES) {
    describe(template.id, () => {
      it("declares exposedInnerService as a real service in its own compose file", () => {
        const parsed = parseComposeYaml(template.composeYaml);
        expect(Object.keys(parsed.services ?? {})).toContain(template.exposedInnerService);
      });

      it("interpolates with every declared env var resolved, parses, normalizes, and passes safety validation", () => {
        const vars = Object.fromEntries(template.envVars.map((envVar) => [envVar.key, dummyValueFor(envVar.value)]));
        const { yaml, missingVariables } = interpolateComposeVariables(template.composeYaml, vars);
        expect(missingVariables).toEqual([]);

        const parsed = parseComposeYaml(yaml);
        normalizeForSwarm(parsed);
        const result = validateComposeSafety(parsed);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });
    });
  }

  it("getTemplateDefinition returns the matching definition for every catalog id", () => {
    expect(getTemplateDefinition("n8n").id).toBe("n8n");
    expect(getTemplateDefinition("phpmyadmin").id).toBe("phpmyadmin");
    expect(getTemplateDefinition("excalidraw").id).toBe("excalidraw");
  });

  it("throws NotFoundError for an unknown template id", () => {
    expect(() => getTemplateDefinition("nope" as never)).toThrow("Unknown template");
  });
});
