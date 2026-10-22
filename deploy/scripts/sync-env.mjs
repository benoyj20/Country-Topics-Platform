// Creates .env from .env.example, or adds the variables an existing .env is
// missing. It never changes a value that is already set and prints only variable
// names, never values. Secrets listed in GENERATED get a fresh random value when
// they are missing or empty.
//
// Usage: node deploy/scripts/sync-env.mjs [example-path] [env-path]

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const GENERATED = {
  PAYLOAD_SECRET: () => randomBytes(32).toString("base64url"),
  BETTER_AUTH_SECRET: () => randomBytes(32).toString("base64url"),
  FORWARDING_KEY: () => randomBytes(32).toString("base64url"),
  PURGE_KEY: () => randomBytes(32).toString("base64url"),
};

const VARIABLE_LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/;

const [examplePath = ".env.example", envPath = ".env"] = process.argv.slice(2);

/** The example's lines, with empty generated secrets filled in. */
function exampleLines() {
  return readFileSync(examplePath, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const match = VARIABLE_LINE.exec(line);
      if (!match) return { line };
      const [, name, value] = match;
      const generate = GENERATED[name];
      return {
        name,
        line: generate && value === "" ? `${name}=${generate()}` : line,
      };
    });
}

/**
 * Writes the whole file to a temporary sibling, then renames it into place, so
 * an interrupted run never leaves a truncated .env.
 */
function writeAtomically(content) {
  const temporaryPath = `${envPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, content, { mode: 0o600 });
  renameSync(temporaryPath, envPath);
}

/** Returns the updated content and the names it added or filled in. */
function addMissing(current, lines) {
  const existing = parseEnv(current);
  const changed = [];
  let updated = current;

  // An empty generated secret (also `""` or `''`) is filled in place, so its
  // line stays where it is.
  for (const name of Object.keys(GENERATED)) {
    const emptyLine = new RegExp(`^${name}=[ \\t]*(""|'')?[ \\t]*$`, "m");
    if (existing[name] === "" && emptyLine.test(updated)) {
      updated = updated.replace(emptyLine, `${name}=${GENERATED[name]()}`);
      changed.push(name);
    }
  }

  const missing = lines.filter(({ name }) => name && !(name in existing));
  if (missing.length > 0) {
    const separator = updated === "" || updated.endsWith("\n") ? "" : "\n";
    updated += `${separator}${missing.map(({ line }) => line).join("\n")}\n`;
    changed.push(...missing.map(({ name }) => name));
  }
  return { updated, changed };
}

const lines = exampleLines();
if (!existsSync(envPath)) {
  writeAtomically(lines.map(({ line }) => line).join("\n"));
  console.log(`Created ${envPath} from ${examplePath}`);
} else {
  const { updated, changed } = addMissing(readFileSync(envPath, "utf8"), lines);
  if (changed.length > 0) {
    writeAtomically(updated);
    console.log(`Updated ${envPath}: added ${changed.join(", ")}`);
  } else {
    console.log(
      `${envPath} already has every variable in ${examplePath}; left unchanged`,
    );
  }
}
