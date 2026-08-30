import path from "node:path";
import { defineConfig } from "vitest/config";

// server-only/client-only are Next.js build-time guards with no meaning under
// plain Vitest; alias them to a no-op so unit tests can import server modules directly.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./test/noop-module.ts"),
    },
  },
});
