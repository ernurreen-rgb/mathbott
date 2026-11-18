import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the pure logic in lib/ and the service worker: `npm test` (CI runs it too).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
