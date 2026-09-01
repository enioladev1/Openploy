import { describe, expect, it } from "vitest";
import { parseComposeYaml } from "./parse";
import { validateComposeSafety } from "./validate";

function validate(yamlText: string) {
  return validateComposeSafety(parseComposeYaml(yamlText));
}

describe("validateComposeSafety", () => {
  it("accepts a plain, safe compose file", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    environment:
      FOO: bar
`);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts the standard top-level name: field", () => {
    const result = validate(`
name: supabase
services:
  web:
    image: nginx:latest
`);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects privileged: true", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    privileged: true
`);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("privileged");
  });

  it("rejects network_mode: host", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    network_mode: host
`);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("network_mode: host");
  });

  it("rejects a host bind mount using absolute-path short syntax", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
`);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("web");
  });

  it("rejects a host bind mount using relative-path short syntax", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    volumes:
      - ./secrets:/app/secrets
`);
    expect(result.valid).toBe(false);
  });

  it("rejects a long-syntax bind mount", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    volumes:
      - type: bind
        source: /etc
        target: /host-etc
`);
    expect(result.valid).toBe(false);
  });

  it("accepts a declared named volume", () => {
    const result = validate(`
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata: {}
`);
    expect(result.valid).toBe(true);
  });

  it("rejects a plain volume name that is not declared at top level", () => {
    const result = validate(`
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
`);
    expect(result.valid).toBe(false);
  });

  it("rejects a disallowed cap_add", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    cap_add:
      - SYS_ADMIN
`);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("SYS_ADMIN");
  });

  it("allows an allowlisted cap_add", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
    cap_add:
      - NET_BIND_SERVICE
`);
    expect(result.valid).toBe(true);
  });

  it("rejects a disallowed top-level key", () => {
    const result = validate(`
services:
  web:
    image: nginx:latest
configs:
  something: {}
`);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("configs");
  });

  it("allows x- extension fields used for YAML anchors", () => {
    const result = validate(`
x-app-env: &app-env
  FOO: bar
services:
  web:
    image: nginx:latest
    environment:
      <<: *app-env
`);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a compose file with no services", () => {
    const result = validate(`
networks: {}
`);
    expect(result.valid).toBe(false);
  });
});
