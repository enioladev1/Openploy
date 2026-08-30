import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { dynamicConfigFileName, renderDomainConfig } from "./render";

describe("renderDomainConfig", () => {
  const baseRoute = {
    domainId: "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d",
    host: "app.example.com",
    path: "/",
    targetServiceName: "app-abc123",
    targetPort: 3000,
    certResolver: "letsencrypt",
  };

  it("produces valid YAML with a Host() rule and TLS resolver", () => {
    const yamlText = renderDomainConfig(baseRoute);
    const parsed = parse(yamlText) as {
      http: { routers: Record<string, unknown>; services: Record<string, unknown> };
    };

    const routerName = Object.keys(parsed.http.routers)[0]!;
    const router = parsed.http.routers[routerName] as {
      rule: string;
      entryPoints: string[];
      tls: { certResolver: string };
    };
    expect(router.rule).toBe("Host(`app.example.com`)");
    expect(router.entryPoints).toEqual(["websecure"]);
    expect(router.tls.certResolver).toBe("letsencrypt");

    const serviceName = Object.keys(parsed.http.services)[0]!;
    const service = parsed.http.services[serviceName] as {
      loadBalancer: { servers: Array<{ url: string }> };
    };
    expect(service.loadBalancer.servers[0]!.url).toBe("http://app-abc123:3000");
  });

  it("adds a PathPrefix clause when path is not /", () => {
    const yamlText = renderDomainConfig({ ...baseRoute, path: "/api" });
    const parsed = parse(yamlText) as { http: { routers: Record<string, { rule: string }> } };
    const rule = Object.values(parsed.http.routers)[0]!.rule;
    expect(rule).toBe("Host(`app.example.com`) && PathPrefix(`/api`)");
  });

  it("uses the web entrypoint with no tls block when certResolver is null", () => {
    const yamlText = renderDomainConfig({ ...baseRoute, certResolver: null });
    const parsed = parse(yamlText) as {
      http: { routers: Record<string, { entryPoints: string[]; tls?: unknown }> };
    };
    const router = Object.values(parsed.http.routers)[0]!;
    expect(router.entryPoints).toEqual(["web"]);
    expect(router.tls).toBeUndefined();
  });

  it("round-trips a host containing rule-special characters through valid YAML without corruption", () => {
    // This only proves the YAML layer doesn't mangle special characters; the real
    // defense against a host value containing backticks (which the Traefik rule DSL
    // itself uses as string delimiters) is hostnameSchema in packages/shared, which
    // rejects anything but letters/digits/hyphens/dots before a route ever gets here.
    const oddHost = "evil.com`) || PathPrefix(`/admin";
    const yamlText = renderDomainConfig({ ...baseRoute, host: oddHost });
    const parsed = parse(yamlText) as { http: { routers: Record<string, { rule: string }> } };
    const rule = Object.values(parsed.http.routers)[0]!.rule;
    expect(rule).toBe(`Host(\`${oddHost}\`)`);
  });
});

describe("dynamicConfigFileName", () => {
  it("sanitizes non-alphanumeric characters out of the domain id", () => {
    expect(dynamicConfigFileName("018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d")).toBe(
      "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d.yml",
    );
    expect(dynamicConfigFileName("../../etc/passwd")).not.toContain("/");
  });
});
