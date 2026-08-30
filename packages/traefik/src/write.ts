import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { dynamicConfigFileName, renderDomainConfig, type DomainRoute } from "./render.js";

/**
 * dynamicConfigDir must be the shared volume mounted into both this agent and
 * the Traefik container (providers.file.directory in Traefik's static config).
 * The write target is always dynamicConfigDir/<sanitized-domainId>.yml -
 * never a path derived from the domain host or any other user-supplied value.
 */
export async function writeDomainConfig(dynamicConfigDir: string, route: DomainRoute): Promise<void> {
  const filePath = path.join(dynamicConfigDir, dynamicConfigFileName(route.domainId));
  await writeFile(filePath, renderDomainConfig(route), "utf8");
}

export async function removeDomainConfig(dynamicConfigDir: string, domainId: string): Promise<void> {
  const filePath = path.join(dynamicConfigDir, dynamicConfigFileName(domainId));
  await rm(filePath, { force: true });
}
