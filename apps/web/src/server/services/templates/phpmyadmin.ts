import "server-only";
import type { TemplateDefinition } from "./types";

export const phpmyadminTemplate: TemplateDefinition = {
  id: "phpmyadmin",
  exposedInnerService: "phpmyadmin",
  exposedPort: 80,
  // No database to point at automatically - the keys are created blank so
  // they're right there in Environment variables, ready for the user to fill
  // in once they know which database service they're administering.
  envVars: [
    { key: "PMA_HOST", value: { type: "empty" } },
    { key: "PMA_USER", value: { type: "empty" } },
    { key: "PMA_PASSWORD", value: { type: "empty" } },
  ],
  composeYaml: `services:
  phpmyadmin:
    image: phpmyadmin/phpmyadmin:5.2.1
    environment:
      PMA_HOST: \${PMA_HOST}
      PMA_USER: \${PMA_USER}
      PMA_PASSWORD: \${PMA_PASSWORD}
      PMA_ARBITRARY: 1
`,
};
