export interface ServiceIconInput {
  id: string;
  type: string;
  engine: string | null;
  templateId: string | null;
}

export interface ServiceIconGroup {
  type: string;
  engine: string | null;
  templateId: string | null;
  count: number;
}

/** One icon per distinct type/engine/template - e.g. two Redis databases collapse into a single Redis icon with count 2, and a template-deployed compose service groups by its own template rather than the generic Compose icon. */
export function groupServiceIcons(services: ServiceIconInput[]): ServiceIconGroup[] {
  const groups = new Map<string, ServiceIconGroup>();
  for (const service of services) {
    const key = service.templateId ?? service.engine ?? service.type;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { type: service.type, engine: service.engine, templateId: service.templateId, count: 1 });
  }
  return [...groups.values()];
}
