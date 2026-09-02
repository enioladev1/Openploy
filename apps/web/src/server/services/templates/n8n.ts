import "server-only";
import type { TemplateDefinition } from "./types";

export const n8nTemplate: TemplateDefinition = {
  id: "n8n",
  exposedInnerService: "n8n",
  exposedPort: 5678,
  envVars: [
    { key: "N8N_HOST", value: { type: "domainHost" } },
    { key: "N8N_PORT", value: { type: "fixed", value: "5678" } },
    { key: "GENERIC_TIMEZONE", value: { type: "fixed", value: "Europe/Berlin" } },
  ],
  composeYaml: `version: "3.8"
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:1.121.0
    restart: always
    environment:
      - N8N_HOST=\${N8N_HOST}
      - N8N_PORT=\${N8N_PORT}
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=https://\${N8N_HOST}/
      - GENERIC_TIMEZONE=\${GENERIC_TIMEZONE}
      - N8N_SECURE_COOKIE=false
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
`,
};
