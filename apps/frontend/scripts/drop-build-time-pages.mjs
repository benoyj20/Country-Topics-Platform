// Removes, after `next build`, the pages whose build-time render has no
// data: the build cannot reach the backend, so the home page is rendered
// with an empty placeholder (app/(site)/page.tsx). Left in the build,
// `next start` and OpenNext, which copies the build into its R2 cache,
// would serve that empty page until it expired an hour later. Without
// it, the first visit renders the page with the backend's data and caches
// it, as every other page is cached.
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const build = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.next",
);
// The build, and the copy of it in the standalone output that OpenNext
// builds the Worker from (the workspace root is the tracing root).
const APP_DIRS = [
  path.join(build, "server/app"),
  path.join(build, "standalone/apps/frontend/.next/server/app"),
];

/** The pages' names in the build: "/" is "index". */
const PAGES = ["index"];

for (const page of PAGES) {
  for (const app of APP_DIRS) {
    for (const suffix of [".html", ".meta", ".rsc", ".segments"]) {
      rmSync(path.join(app, `${page}${suffix}`), {
        recursive: true,
        force: true,
      });
    }
  }
  console.log(
    `Left the build-time /${page === "index" ? "" : page} out of the build.`,
  );
}
