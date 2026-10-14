// Creates .env from .env.example, or adds the variables an existing .env is
// missing. It never changes a value that is already set and prints only variable
// names, never values. Secrets listed in GENERATED get a fresh random value.
//
// Usage: node deploy/scripts/sync-env.mjs [example-path] [env-path]

import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";

const GENERATED = {
  PAYLOAD_SECRET: () => randomBytes(32).toString("base64url"),
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

function createEnv(lines) {
  writeFileSync(envPath, lines.map(({ line }) => line).join("\n"), {
    mode: 0o600,
  });
  console.log(`Created ${envPath} from ${examplePath}`);
}

function addMissing(lines) {
  const current = readFileSync(envPath, "utf8");
  const existing = parseEnv(current);
  const filled = [];
  let updated = current;

  // An empty generated secret is filled in place, so its line stays where it is.
  for (const name of Object.keys(GENERATED)) {
    const emptyLine = new RegExp(`^${name}=[ \\t]*$`, "m");
    if (existing[name] === "" && emptyLine.test(updated)) {
      updated = updated.replace(emptyLine, `${name}=${GENERATED[name]()}`);
      filled.push(name);
    }
  }
  if (filled.length > 0) writeFileSync(envPath, updated);

  const missing = lines.filter(({ name }) => name && !(name in existing));
  if (missing.length > 0) {
    const separator = updated === "" || updated.endsWith("\n") ? "" : "\n";
    appendFileSync(
      envPath,
      `${separator}${missing.map(({ line }) => line).join("\n")}\n`,
    );
  }

  const changed = [...filled, ...missing.map(({ name }) => name)];
  console.log(
    changed.length > 0
      ? `Updated ${envPath}: added ${changed.join(", ")}`
      : `${envPath} already has every variable in ${examplePath}; left unchanged`,
  );
}

const lines = exampleLines();
if (existsSync(envPath)) addMissing(lines);
else createEnv(lines);
