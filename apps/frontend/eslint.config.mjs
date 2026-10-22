import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// The frontend holds no database, queue, or service credentials (ADR
// 0014), so it imports nothing that would reach them. Payload's rich-text
// renderer is the one exception: it runs on Workers without Payload's
// server code (phase 1).
const SERVER_ONLY =
  "The frontend reaches the backend only over HTTP (ADR 0014); use packages/contracts.";

const SERVER_PATHS = [
  "payload",
  "@payloadcms/richtext-lexical",
  "pg",
  "ioredis",
  "bullmq",
  "@countrytopics/jobs",
  "@countrytopics/search",
].map((name) => ({ name, message: SERVER_ONLY }));

const SERVER_PATTERNS = [
  {
    // Re-included in steps, as in .gitignore: only the renderer (/react)
    // is allowed; the package's main entry is listed in SERVER_PATHS.
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
];

/**
 * The import rule for some files: the server-only packages, and the
 * modules those files must leave to others (ADR 0015). A file's own rule
 * replaces the general one, so each repeats the server-only list.
 */
function restricted(...patterns) {
  return {
    "no-restricted-imports": [
      "error",
      { paths: SERVER_PATHS, patterns: [...SERVER_PATTERNS, ...patterns] },
    ],
  };
}

// The admin's features (ADR 0015): each in src/admin/features/<name>,
// owned by one team, and reached by the rest of the admin only through
// the registries in src/admin/registry.
const FEATURES = [
  "archives",
  "audit",
  "individuals",
  "media",
  "moderation",
  "people",
  "references",
  "snippets",
  "taxonomy",
  "topics",
];

const OTHER_FEATURE =
  "Features do not reach into each other (ADR 0015): move what both need into the admin's core, or ask the owning team for it.";
const NO_FEATURES_IN_CORE =
  "The admin's core knows no feature (ADR 0015): reach features through src/admin/registry.";
const SITE_ONLY =
  "The admin does not use the site's components (ADR 0015): move what both need to src/shared.";
const ADMIN_ONLY =
  "The site does not use the admin's code (ADR 0015): move what both need to src/shared.";
const SHARED_STAYS_SHARED =
  "Shared code serves the site and the admin alike (ADR 0015), so it imports neither.";

// Each pattern list names an import both by its alias and by the relative
// paths that reach the same place, since either would cross the line.
const NO_ADMIN = {
  group: ["@/admin", "@/admin/*", "**/admin", "**/admin/*"],
  message: ADMIN_ONLY,
};
const NO_FEATURES = {
  group: [
    "@/admin/features",
    "@/admin/features/*",
    "**/features",
    "**/features/*",
  ],
  message: NO_FEATURES_IN_CORE,
};
const NO_REGISTRY = {
  group: [
    "@/admin/registry",
    "@/admin/registry/*",
    "**/registry",
    "**/registry/*",
  ],
  message:
    "A feature is listed in the registries; it does not read them (ADR 0015).",
};

/** The site's components, by alias and from a file `depth` folders inside src/admin. */
function noSiteComponents(depth) {
  const up = "../".repeat(depth + 1);
  return {
    group: [
      "@/components",
      "@/components/*",
      `${up}components`,
      `${up}components/*`,
    ],
    message: SITE_ONLY,
  };
}

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: restricted() },
  // The site's pages and components leave the admin alone.
  {
    files: ["src/app/(site)/**", "src/components/**"],
    rules: restricted(NO_ADMIN),
  },
  // The topic preview is the admin's, shown in the site's layout: it may
  // ask the admin's gate and its topics for the draft.
  {
    files: ["src/app/(site)/preview/**"],
    rules: restricted({
      group: [
        "**/admin/*",
        "!@/admin/gate",
        "!@/admin/features",
        "@/admin/features/*",
        "!@/admin/features/topics",
        "@/admin/features/topics/*",
        "!@/admin/features/topics/backend",
      ],
      message: ADMIN_ONLY,
    }),
  },
  {
    files: ["src/shared/**"],
    rules: restricted({
      group: [
        ...NO_ADMIN.group,
        "@/components",
        "@/components/*",
        "**/components",
        "**/components/*",
        "@/app/*",
        "**/app/*",
      ],
      message: SHARED_STAYS_SHARED,
    }),
  },
  // The admin's core, by how deep a file is, so its relative paths to the
  // site's components are caught too; it reaches features only through
  // the registries.
  {
    files: ["src/admin/*.{ts,tsx}"],
    rules: restricted(noSiteComponents(0), NO_FEATURES),
  },
  {
    files: ["src/admin/*/*.{ts,tsx}"],
    ignores: ["src/admin/registry/**"],
    rules: restricted(noSiteComponents(1), NO_FEATURES),
  },
  {
    files: ["src/admin/registry/**"],
    rules: restricted(noSiteComponents(1)),
  },
  // Each feature: its own folder and the core, never another feature or
  // the registries.
  ...FEATURES.map((feature) => {
    const others = FEATURES.filter((other) => other !== feature);
    return {
      files: [`src/admin/features/${feature}/**`],
      rules: restricted(
        noSiteComponents(2),
        {
          group: others.flatMap((other) => [
            `**/features/${other}`,
            `**/features/${other}/*`,
            `../${other}`,
            `../${other}/*`,
            `../../${other}`,
            `../../${other}/*`,
          ]),
          message: OTHER_FEATURE,
        },
        NO_REGISTRY,
      ),
    };
  }),
  // The admin's pages use the core and the registries; only the topics'
  // own pages use their feature directly.
  {
    files: ["src/app/(admin)/**"],
    rules: restricted(
      { group: ["@/components", "@/components/*"], message: SITE_ONLY },
      NO_FEATURES,
    ),
  },
  {
    files: [
      "src/app/(admin)/admin/collections/topics/**",
      "src/app/(admin)/admin/collections/topic-changes/**",
    ],
    rules: restricted(
      { group: ["@/components", "@/components/*"], message: SITE_ONLY },
      {
        group: [
          "@/admin/features/*",
          "!@/admin/features/topics",
        ],
        message: NO_FEATURES_IN_CORE,
      },
    ),
  },
  {
    // Compares the admin's body editor with Payload's own nodes, so it
    // loads Payload's editor package; it runs in Node and ships nowhere.
    files: ["tests/body-json.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/", ".open-next/", ".wrangler/", "next-env.d.ts"]),
]);
