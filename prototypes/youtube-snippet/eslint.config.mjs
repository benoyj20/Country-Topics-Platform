import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  {
    files: ["app.js"],
    languageOptions: { globals: { ...globals.browser, YT: "readonly" } },
  },
  {
    // Imported by the browser page and by the Node tests.
    files: ["transcript.js"],
    languageOptions: { globals: globals["shared-node-browser"] },
  },
  {
    files: ["server.mjs", "*.test.mjs", "eslint.config.mjs"],
    languageOptions: { globals: globals.node },
  },
]);
