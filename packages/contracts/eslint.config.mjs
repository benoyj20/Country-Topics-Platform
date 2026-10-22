import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Each feature's lists are its own (ADR 0015): built from fields.ts and
  // the domain, never from another feature's, and combined in admin-lists.ts.
  {
    files: ["src/lists/**"],
    ignores: ["src/lists/fields.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // The package itself too: it would load admin-lists.ts again
              // before that file has combined the lists.
              group: [
                "./*",
                "!./fields.ts",
                "../*",
                "@countrytopics/contracts",
                "@countrytopics/contracts/*",
              ],
              message:
                "A feature's lists use only ./fields.ts and @countrytopics/domain (ADR 0015).",
            },
          ],
        },
      ],
    },
  },
]);
