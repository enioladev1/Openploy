import { describe, expect, it } from "vitest";
import {
  mergeComposeConfig,
  normalizeDependsOn,
  normalizeEnvironmentBooleans,
  serializeCompose,
  stripPublishedPorts,
} from "./merge";
import { parseComposeYaml } from "./parse";

describe("mergeComposeConfig", () => {
  it("injects env vars into the target service and preserves existing ones", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    environment:
      EXISTING: value
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "web",
      envVars: { DATABASE_URL: "postgres://db" },
      networkName: "platform_internal",
    });
    expect(merged.services!.web!.environment).toEqual({
      EXISTING: "value",
      DATABASE_URL: "postgres://db",
    });
  });

  it("normalizes array-form environment before merging", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    environment:
      - EXISTING=value
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "web",
      envVars: { NEW: "1" },
      networkName: "platform_internal",
    });
    expect(merged.services!.web!.environment).toEqual({ EXISTING: "value", NEW: "1" });
  });

  it("keeps a service with no prior networks: on the stack's default network alongside the injected one, so it can still reach sibling services", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
  postgres:
    image: postgres:17-alpine
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "app",
      envVars: {},
      networkName: "platform_internal",
    });
    // postgres never gets an explicit networks: list, so it stays only on the
    // implicit default network - app must keep "default" too, or it silently
    // loses DNS resolution of "postgres" the moment it also gets platform_internal.
    expect(merged.services!.app!.networks).toEqual(["default", "platform_internal"]);
  });

  it("attaches the platform network without duplicating an already-present one", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    networks:
      - platform_internal
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "web",
      envVars: {},
      networkName: "platform_internal",
    });
    expect(merged.services!.web!.networks).toEqual(["platform_internal"]);
  });

  it("declares the platform network as external at top level", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "web",
      envVars: {},
      networkName: "platform_internal",
    });
    expect(merged.networks).toEqual({ platform_internal: { external: true } });
  });

  it("throws when the target service does not exist in the compose file", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
`);
    expect(() =>
      mergeComposeConfig(doc, { targetServiceName: "missing", envVars: {}, networkName: "platform_internal" }),
    ).toThrow(/not found/);
  });

  it("serializes an env value containing YAML-special characters as a safe scalar, not broken structure", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
`);
    const merged = mergeComposeConfig(doc, {
      targetServiceName: "web",
      envVars: { TRICKY: "value: with colon\nand a newline\nand: another colon" },
      networkName: "platform_internal",
    });

    const yamlText = serializeCompose(merged);
    const reparsed = parseComposeYaml(yamlText);
    expect((reparsed.services!.web!.environment as Record<string, string>).TRICKY).toBe(
      "value: with colon\nand a newline\nand: another colon",
    );
  });
});

describe("normalizeEnvironmentBooleans", () => {
  it("converts a bare boolean environment value to its string form", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    environment:
      DEBUG: false
`);
    normalizeEnvironmentBooleans(doc);
    expect(doc.services!.web!.environment).toEqual({ DEBUG: "false" });
  });

  it("does not touch boolean fields outside environment maps", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    tty: true
    environment:
      DEBUG: false
`);
    normalizeEnvironmentBooleans(doc);
    expect(doc.services!.web!.tty).toBe(true);
    expect(doc.services!.web!.environment).toEqual({ DEBUG: "false" });
  });

  it("coerces booleans inside a merge-key-referenced environment fragment, preserving the anchor for re-serialization", () => {
    const doc = parseComposeYaml(`
x-app-env: &app-env
  DEBUG: false
  SECURE: true
services:
  app:
    image: nginx:latest
    environment:
      <<: *app-env
  worker:
    image: nginx:latest
    environment:
      <<: *app-env
`);
    normalizeEnvironmentBooleans(doc);

    const yamlText = serializeCompose(doc);
    expect(yamlText).toContain("&");
    expect(yamlText).toContain("*");

    const reparsed = parseComposeYaml(yamlText);
    const appEnv = reparsed.services!.app!.environment as Record<string, unknown>;
    expect((appEnv["<<"] as Record<string, unknown>).DEBUG).toBe("false");
    expect((appEnv["<<"] as Record<string, unknown>).SECURE).toBe("true");
  });

  it("leaves array-form (KEY=VALUE) environment entries untouched", () => {
    const doc = parseComposeYaml(`
services:
  web:
    image: nginx:latest
    environment:
      - DEBUG=false
`);
    normalizeEnvironmentBooleans(doc);
    expect(doc.services!.web!.environment).toEqual(["DEBUG=false"]);
  });
});

describe("normalizeDependsOn", () => {
  it("reduces the long-form depends_on with health conditions to a plain service-name list", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
  postgres:
    image: postgres:17-alpine
  redis:
    image: redis:7-alpine
`);
    normalizeDependsOn(doc);
    expect(doc.services!.app!.depends_on).toEqual(["postgres", "redis"]);
  });

  it("leaves an already-plain depends_on list untouched", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
    depends_on:
      - postgres
  postgres:
    image: postgres:17-alpine
`);
    normalizeDependsOn(doc);
    expect(doc.services!.app!.depends_on).toEqual(["postgres"]);
  });

  it("leaves a service with no depends_on untouched", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
`);
    normalizeDependsOn(doc);
    expect(doc.services!.app!.depends_on).toBeUndefined();
  });
});

describe("stripPublishedPorts", () => {
  it("removes a short-form ports list from every service", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
    ports:
      - "8080:8080"
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
`);
    stripPublishedPorts(doc);
    expect(doc.services!.app!.ports).toBeUndefined();
    expect(doc.services!.postgres!.ports).toBeUndefined();
  });

  it("removes a long-form ports list too", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
    ports:
      - target: 8080
        published: 8080
`);
    stripPublishedPorts(doc);
    expect(doc.services!.app!.ports).toBeUndefined();
  });

  it("leaves a service with no ports: untouched", () => {
    const doc = parseComposeYaml(`
services:
  app:
    image: web:latest
`);
    stripPublishedPorts(doc);
    expect(doc.services!.app!.ports).toBeUndefined();
    expect("ports" in doc.services!.app!).toBe(false);
  });
});
