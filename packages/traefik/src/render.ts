import { stringify } from "yaml";

export interface DomainRoute {
  /** Our own domains.id - the only thing router/service names are derived from, never the user-supplied host. */
  domainId: string;
  host: string;
  path: string;
  targetServiceName: string;
  targetPort: number;
  /** null means plain HTTP (no cert configured yet / intentionally unencrypted internal preview). */
  certResolver: string | null;
}

function sanitizeIdentifier(input: string): string {
  return input.replace(/[^a-zA-Z0-9-]/g, "-");
}

function buildRule(host: string, path: string): string {
  const hostRule = `Host(\`${host}\`)`;
  if (!path || path === "/") return hostRule;
  return `${hostRule} && PathPrefix(\`${path}\`)`;
}

/**
 * One router+service pair per domain. TLS-vs-plain is the only branch: the
 * global HTTP->HTTPS redirect and ACME challenge interception both live in
 * Traefik's static config, not here, so this never needs to know about entrypoint 80.
 */
export function renderDomainConfig(route: DomainRoute): string {
  const routerName = `router-${sanitizeIdentifier(route.domainId)}`;
  const serviceName = `service-${sanitizeIdentifier(route.domainId)}`;

  const router = route.certResolver
    ? {
        rule: buildRule(route.host, route.path),
        entryPoints: ["websecure"],
        service: serviceName,
        tls: { certResolver: route.certResolver },
      }
    : {
        rule: buildRule(route.host, route.path),
        entryPoints: ["web"],
        service: serviceName,
      };

  const document = {
    http: {
      routers: { [routerName]: router },
      services: {
        [serviceName]: {
          loadBalancer: {
            servers: [{ url: `http://${route.targetServiceName}:${route.targetPort}` }],
          },
        },
      },
    },
  };

  return stringify(document);
}

/** Deterministic, platform-controlled file path - never built from user input beyond the domain's own id. */
export function dynamicConfigFileName(domainId: string): string {
  return `${sanitizeIdentifier(domainId)}.yml`;
}
