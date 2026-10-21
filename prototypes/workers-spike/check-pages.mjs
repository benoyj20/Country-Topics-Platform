// Checks that the public pages load none of the admin's scripts or styles,
// and the admin none of the site's (ADR 0014, phase 2), and reports what
// each page loads. Run in the container while the preview is up:
//   node check-pages.mjs
// ADMIN_COOKIE (a staff session's Cookie header) and ADMIN_TOPIC (a topic's
// id) add the topic editor, which only staff can open. Throwaway.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const SITE = process.env.SITE ?? "http://localhost:8787";
const ASSETS = ".open-next/assets";

// Text only the admin's files hold (its form, the Lexical editor, its
// styles), and text only the site's styles hold.
const ADMIN_MARKERS = [
  "Save draft",
  "New TEST topic",
  "__lexicalEditor",
  "editor-toolbar",
];
const SITE_MARKERS = [".lede{", ".lede {"];

function builtFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? builtFiles(path) : [path];
  });
}

const files = new Map(
  builtFiles(join(ASSETS, "_next", "static"))
    .filter((path) => /\.(js|css)$/.test(path))
    .map((path) => [
      `/${relative(ASSETS, path).replaceAll("\\", "/")}`,
      readFileSync(path),
    ]),
);

function holding(markers) {
  return new Set(
    [...files]
      .filter(([, content]) =>
        markers.some((marker) => content.includes(marker)),
      )
      .map(([path]) => path),
  );
}

const adminFiles = holding(ADMIN_MARKERS);
const siteFiles = holding(SITE_MARKERS);

/** The scripts and styles a page names, in its HTML or its RSC payload. */
async function loads(path, cookie) {
  const response = await fetch(`${SITE}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  const html = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    html,
    files: new Set(html.match(/\/_next\/static\/[^"'\\\s)]+\.(?:js|css)/g)),
  };
}

function size(paths, extension) {
  const chosen = [...paths].filter((path) => path.endsWith(extension));
  const raw = chosen.reduce(
    (sum, path) => sum + (files.get(path)?.length ?? 0),
    0,
  );
  const gzip = chosen.reduce(
    (sum, path) => sum + gzipSync(files.get(path) ?? Buffer.alloc(0)).length,
    0,
  );
  return `${chosen.length} ${extension} files, ${(raw / 1024).toFixed(1)} KB (${(gzip / 1024).toFixed(1)} KB gzipped)`;
}

let failed = false;
function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failed = true;
}

check(adminFiles.size > 0, `the admin's files are found (${adminFiles.size})`);
check(siteFiles.size > 0, `the site's styles are found (${siteFiles.size})`);

const pages = [
  ["/topics/test-workers-spike-topic", "site"],
  ["/short/test-workers-spike-topic", "site"],
  ["/admin", "admin"],
];
if (process.env.ADMIN_COOKIE && process.env.ADMIN_TOPIC) {
  pages.push([`/admin/topics/${process.env.ADMIN_TOPIC}`, "admin"]);
}

for (const [path, part] of pages) {
  const cookie = part === "admin" ? process.env.ADMIN_COOKIE : undefined;
  const page = await loads(path, cookie);
  console.log(
    `\n${path} (${page.status}, cache-control: ${page.cacheControl})`,
  );
  console.log(`  ${size(page.files, ".js")}; ${size(page.files, ".css")}`);
  check(page.status === 200, "answers 200");
  const others = part === "site" ? adminFiles : siteFiles;
  const loaded = [...page.files].filter((file) => others.has(file));
  check(
    loaded.length === 0,
    `loads none of the ${part === "site" ? "admin's" : "site's"} files${loaded.length ? `: ${loaded.join(", ")}` : ""}`,
  );
  if (part === "admin") {
    check(/no-store/.test(page.cacheControl ?? ""), "is sent with no-store");
  }
}

console.log(
  `\nThe admin's files: ${size(adminFiles, ".js")}; ${size(adminFiles, ".css")}`,
);
process.exit(failed ? 1 : 0);
