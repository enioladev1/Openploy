import "server-only";
import type { TemplateDefinition } from "./types";

export const excalidrawTemplate: TemplateDefinition = {
  id: "excalidraw",
  exposedInnerService: "excalidraw",
  exposedPort: 80,
  envVars: [],
  composeYaml: `version: "3.8"

services:
  excalidraw:
    restart: unless-stopped
    image: excalidraw/excalidraw:latest
    healthcheck:
      test:
        - CMD
        - wget
        - '--spider'
        - '--quiet'
        - 'http://localhost'
      interval: 30s
      timeout: 5s
      retries: 3
`,
};
