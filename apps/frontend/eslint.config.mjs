import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// The frontend holds no database, queue, or service credentials (ADR
// 0014), so it imports nothing that would reach them. Payload's rich-text
// renderer is the one exception: it runs on Workers without Payload's
// server code (phase 1).
const SERVER_ONLY =
  "The frontend reaches the backend only over HTTP (ADR 0014); use packages/contracts.";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "payload",
            "@payloadcms/richtext-lexical",
            "pg",
            "ioredis",
            "bullmq",
            "@countrytopics/jobs",
            "@countrytopics/search",
          ].map((name) => ({ name, message: SERVER_ONLY })),
          patterns: [
            {
              // Re-included in steps, as in .gitignore: only the renderer
              // (/react) is allowed; the package's main entry is listed
              // in `paths`.
              group: [
                "payload/*",
                "@payloadcms/*",
                "!@payloadcms/richtext-lexical",
                "@payloadcms/richtext-lexical/*",
                "!@payloadcms/richtext-lexical/react",
                "pg/*",
                "ioredis/*",
                "bullmq/*",
                "@countrytopics/jobs/*",
                "@countrytopics/search/*",
              ],
              message: SERVER_ONLY,
            },
          ],
        },
      ],
    },
  },
  {
    // Compares the admin's body editor with Payload's own nodes, so it
    // loads Payload's editor package; it runs in Node and ships nowhere.
    files: ["tests/body-json.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/", ".open-next/", ".wrangler/", "next-env.d.ts"]),
]);
