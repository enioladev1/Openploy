import { z } from "zod";

// The catalog of pre-installed one-click templates - deliberately code, not a
// DB table (see template-service.ts on the web side for the actual
// provisioning logic). Adding a new template is a code change + release, not
// something a user configures at runtime.
export const templateIdSchema = z.enum(["n8n", "phpmyadmin", "excalidraw"]);
export type TemplateId = z.infer<typeof templateIdSchema>;

export interface TemplateCatalogEntry {
  id: TemplateId;
  name: string;
  description: string;
  /** Path under /public - client-safe, unlike the actual compose YAML which stays server-only. */
  logo: string;
}

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  { id: "n8n", name: "n8n", description: "Workflow automation - connect apps and APIs without code", logo: "/logos/templates/n8n.png" },
  { id: "phpmyadmin", name: "phpMyAdmin", description: "Web UI for administering a MySQL/MariaDB database", logo: "/logos/templates/phpmyadmin.png" },
  { id: "excalidraw", name: "Excalidraw", description: "Collaborative whiteboard for hand-drawn style diagrams", logo: "/logos/templates/excalidraw.jpg" },
];

export const deployTemplateInputSchema = z.object({
  projectId: z.string().uuid(),
  templateId: templateIdSchema,
});
export type DeployTemplateInput = z.infer<typeof deployTemplateInputSchema>;
