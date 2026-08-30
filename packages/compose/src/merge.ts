import { stringify } from "yaml";
import type { ComposeDocument } from "./types";

function normalizeEnvironment(env: Record<string, string> | string[] | undefined): Record<string, string> {
  if (!env) return {};
  if (Array.isArray(env)) {
    const result: Record<string, string> = {};
    for (const entry of env) {
      const [key, ...rest] = entry.split("=");
      if (key) result[key] = rest.join("=");
    }
    return result;
  }
  return env;
}

export interface ComposeMergeOptions {
  /** The one inner service the platform routes a domain to and injects managed env vars into. */
  targetServiceName: string;
  envVars: Record<string, string>;
  networkName: string;
}

/**
 * Mutates fields on the parsed object rather than the source text - the
 * re-serialization below guarantees structurally valid output no matter what
 * the user's original formatting looked like.
 */
export function mergeComposeConfig(doc: ComposeDocument, options: ComposeMergeOptions): ComposeDocument {
  const service = doc.services?.[options.targetServiceName];
  if (!service) {
    throw new Error(`Target service "${options.targetServiceName}" not found in compose file`);
  }

  service.environment = { ...normalizeEnvironment(service.environment), ...options.envVars };

  // A service with no explicit `networks:` implicitly joins the stack's own
  // default network - that's how it reaches sibling services (a database,
  // a cache) declared in the same compose file with no networks: of their
  // own either. Compose semantics mean that ONCE a service gets an explicit
  // networks: list (as we're about to give it, to attach platform_internal),
  // it stops implicitly joining anything - so an implicit service must be
  // handed "default" explicitly here, or injecting our own network silently
  // cuts it off from every sibling it depends on.
  const hadNoExplicitNetworks = service.networks === undefined;
  const networks = Array.isArray(service.networks)
    ? [...service.networks]
    : Object.keys(service.networks ?? {});
  if (hadNoExplicitNetworks) networks.push("default");
  if (!networks.includes(options.networkName)) networks.push(options.networkName);
  service.networks = networks;

  // platform_internal already exists on the swarm (created once by the installer);
  // marking it external tells compose not to try creating its own network with that name.
  doc.networks = { ...doc.networks, [options.networkName]: { external: true } };

  return doc;
}

function coerceBooleansInPlace(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "boolean") {
      obj[key] = String(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      coerceBooleansInPlace(value as Record<string, unknown>);
    }
  }
}

/**
 * Compose's schema forbids bare booleans as `environment:` values ("must be
 * a string, number or null") even though a container env var is always a
 * string anyway - `docker compose` tolerates it, `docker stack deploy` does
 * not. Real compose files commonly produce one via `${VAR:-false}`-style
 * defaults. Mutates nested objects in place (rather than replacing them) so
 * an environment value merged in via a YAML anchor/`<<:` keeps the same
 * object identity - replacing it would break the anchor on re-serialization.
 */
export function normalizeEnvironmentBooleans(doc: ComposeDocument): void {
  for (const service of Object.values(doc.services ?? {})) {
    const env = service.environment;
    if (env && typeof env === "object" && !Array.isArray(env)) {
      coerceBooleansInPlace(env as Record<string, unknown>);
    }
  }
}

/**
 * Swarm mode has never supported Compose's long-form `depends_on` with
 * health-check conditions (`condition: service_healthy`) - it doesn't do
 * startup ordering at all, so the condition was always going to be a no-op
 * once deployed via `docker stack deploy` even if the schema accepted it.
 * Reducing to the plain service-name list is what Swarm actually
 * understands and matches standard Swarm-migration guidance; it doesn't
 * change what Swarm would have done with the long form, just what it's
 * willing to parse.
 */
export function normalizeDependsOn(doc: ComposeDocument): void {
  for (const service of Object.values(doc.services ?? {})) {
    const dependsOn = service["depends_on"];
    if (dependsOn && typeof dependsOn === "object" && !Array.isArray(dependsOn)) {
      service["depends_on"] = Object.keys(dependsOn);
    }
  }
}

/**
 * A compose file's `ports:` publishes in Swarm ingress mode, which binds the
 * host port cluster-wide - a second, unrelated compose stack using the same
 * port (e.g. the common 8080 default) fails to deploy with a port-in-use
 * error. The platform's only supported exposure path is Traefik on
 * platform_internal (see mergeComposeConfig's exposedInnerService wiring), so
 * host-published ports are never needed and are always stripped.
 */
export function stripPublishedPorts(doc: ComposeDocument): void {
  for (const service of Object.values(doc.services ?? {})) {
    delete service.ports;
  }
}

/** Single entry point for the Swarm-compatibility fixups above - deploy-compose.ts calls this once. */
export function normalizeForSwarm(doc: ComposeDocument): void {
  normalizeEnvironmentBooleans(doc);
  normalizeDependsOn(doc);
  stripPublishedPorts(doc);
}

export function serializeCompose(doc: ComposeDocument): string {
  return stringify(doc);
}
