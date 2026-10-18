import { spawn } from "node:child_process";
import pg from "pg";

// The database side of backups: a dump and the row counts of the same
// snapshot, and a restore into a database created for it. The PostgreSQL
// tools (pg_dump, pg_restore) come with the backup image.

const CONNECT_TIMEOUT_MS = 5_000;
/** The longest a dump or a restore may take before it is stopped. */
const TOOL_TIMEOUT_MS = 30 * 60 * 1_000;
/** Names a restore may create: plain lowercase identifiers. */
const DATABASE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

/** The same server, another database. */
export function withDatabase(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(name)}`;
  return url.toString();
}

/**
 * The libpq environment for a connection URL, so the password reaches the
 * tools without appearing in their command line. A URL without a password
 * leaves PGPASSWORD as the process has it, as the pg client does.
 */
export function libpqEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: databaseName(databaseUrl),
    PGCONNECT_TIMEOUT: String(CONNECT_TIMEOUT_MS / 1_000),
  };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function connect(databaseUrl: string): pg.Client {
  return new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
}

const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Rows in every table of the public schema, as `client` sees them. */
async function countTables(client: pg.Client): Promise<Record<string, number>> {
  const { rows: tables } = await client.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    // The names come from the catalog, quoted, never from input.
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM public.${quoteIdentifier(name)}`,
    );
    counts[name] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

async function lastMigration(client: pg.Client): Promise<string | null> {
  const { rows } = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.payload_migrations') IS NOT NULL AS exists",
  );
  if (!rows[0]?.exists) return null;
  const { rows: names } = await client.query<{ name: string }>(
    "SELECT name FROM payload_migrations ORDER BY name DESC LIMIT 1",
  );
  return names[0]?.name ?? null;
}

/** Runs a PostgreSQL tool; its error output explains a failure. */
function runTool(
  command: string,
  args: string[],
  databaseUrl: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...libpqEnv(databaseUrl) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-4_000);
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), TOOL_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${command} could not start: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} failed (${signal ?? `exit ${code}`}): ${errors.trim()}`,
          ),
        );
      }
    });
  });
}

export type DatabaseDump = {
  tables: Record<string, number>;
  lastMigration: string | null;
};

/**
 * Dumps the database to `path` and counts its rows, both from one snapshot,
 * so a restore can be checked table by table.
 */
export async function dumpDatabase(
  databaseUrl: string,
  path: string,
): Promise<DatabaseDump> {
  const client = connect(databaseUrl);
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query<{ snapshot: string }>(
      "SELECT pg_export_snapshot() AS snapshot",
    );
    const snapshot = rows[0]?.snapshot;
    if (!snapshot) throw new Error("PostgreSQL exported no snapshot.");
    const tables = await countTables(client);
    const migration = await lastMigration(client);
    // The snapshot is usable while this transaction stays open.
    await runTool(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        `--snapshot=${snapshot}`,
        `--file=${path}`,
      ],
      databaseUrl,
    );
    await client.query("COMMIT");
    return { tables, lastMigration: migration };
  } finally {
    await client.end();
  }
}

/**
 * Why `name` cannot receive a restore, or null when it can: it must be a
 * plain name, not the live database, and not exist yet.
 */
export async function restoreTargetProblem(
  databaseUrl: string,
  name: string,
): Promise<string | null> {
  if (!DATABASE_NAME_PATTERN.test(name)) {
    return "Name the new database with lowercase letters, digits, and underscores.";
  }
  if (name === databaseName(databaseUrl)) {
    return "A backup is restored into a new database, never over the live one.";
  }
  const client = connect(withDatabase(databaseUrl, "postgres"));
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    return rows.length > 0
      ? `The database ${name} already exists. Choose a new name.`
      : null;
  } finally {
    await client.end();
  }
}

/**
 * Creates the database `name` on the same server, restores the dump into
 * it, and counts its rows.
 */
export async function restoreDatabase(
  databaseUrl: string,
  name: string,
  path: string,
): Promise<Record<string, number>> {
  const problem = await restoreTargetProblem(databaseUrl, name);
  if (problem) throw new Error(problem);
  const admin = connect(withDatabase(databaseUrl, "postgres"));
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  } finally {
    await admin.end();
  }
  const target = withDatabase(databaseUrl, name);
  await runTool(
    "pg_restore",
    ["--no-owner", "--no-acl", "--exit-on-error", `--dbname=${name}`, path],
    target,
  );
  const client = connect(target);
  await client.connect();
  try {
    return await countTables(client);
  } finally {
    await client.end();
  }
}
