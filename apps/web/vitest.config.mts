import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

export default defineConfig({
  // Mirrors the "paths" in tsconfig.json.
  resolve: {
    alias: { "@payload-config": path.join(src, "payload.config.ts"), "@": src },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "int",
          include: ["tests/int/**/*.test.ts"],
          // Rebuilds the dedicated test database from the committed migrations.
          globalSetup: ["tests/int/global-setup.ts"],
          // The test files share one database.
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
