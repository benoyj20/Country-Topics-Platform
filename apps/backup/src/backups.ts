import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import {
  backupId,
  countDifferences,
  dumpKey,
  expiredBackups,
  FILES_PREFIX,
  idFromManifestKey,
  type Manifest,
  manifestKey,
  parseManifest,
  unusedFileCopies,
} from "./catalog.ts";
import { dumpDatabase, restoreDatabase } from "./postgres.ts";
import type { Storage } from "./storage.ts";

// Taking, listing, pruning, and restoring backups (ADR 0012). The database
// is the source of truth; uploads are copied beside it. Valkey holds only
// queues, rate limits, and caches, which rebuild themselves, so it is not
// backed up.

type Log = (message: string) => void;

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "countrytopics-backup-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Copies each object of `from` under `fromPrefix` (only the names in
 * `only`, when given) that `to` does not yet hold with the same size, to
 * `toPrefix` plus the rest of its key. Returns the names considered (keys
 * without `fromPrefix`) and how many were copied.
 */
async function copyMissing(
  from: Storage,
  fromPrefix: string,
  to: Storage,
  toPrefix: string,
  only?: ReadonlySet<string>,
): Promise<{ names: string[]; copied: number }> {
  const present = new Map<string, number>();
  for await (const item of to.list(toPrefix)) present.set(item.key, item.size);
  const names: string[] = [];
  let copied = 0;
  for await (const item of from.list(fromPrefix)) {
    const name = item.key.slice(fromPrefix.length);
    if (only && !only.has(name)) continue;
    names.push(name);
    const key = toPrefix + name;
    if (present.get(key) === item.size) continue;
    const { body, size, type } = await from.open(item.key);
    await to.write(key, body, size, type);
    present.set(key, size);
    copied += 1;
  }
  return { names, copied };
}

/**
 * Every finished backup, newest first. A manifest that cannot be read is
 * left out and logged as an error (which error reporting sends on), so one
 * damaged file cannot stop backups.
 */
export async function listBackups(backups: Storage): Promise<Manifest[]> {
  const manifests: Manifest[] = [];
  for await (const item of backups.list("db/")) {
    if (!idFromManifestKey(item.key)) continue;
    try {
      manifests.push(parseManifest(await backups.readText(item.key)));
    } catch (error) {
      console.error(
        `Backup manifest ${item.key} cannot be read, so it is skipped:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Deletes backups past their retention, then the upload copies no kept
 * backup lists; returns the deleted backups' ids.
 */
export async function pruneBackups(
  backups: Storage,
  now: Date,
): Promise<string[]> {
  const manifests = await listBackups(backups);
  const expired = expiredBackups(manifests, now);
  for (const { id } of expired) {
    // The manifest first, so a half-deleted backup is never listed.
    await backups.remove([manifestKey(id)]);
    await backups.remove([dumpKey(id)]);
  }
  const kept = manifests.filter((manifest) => !expired.includes(manifest));
  const copies: string[] = [];
  for await (const item of backups.list(FILES_PREFIX)) copies.push(item.key);
  await backups.remove(unusedFileCopies(copies, kept));
  return expired.map(({ id }) => id);
}

/**
 * Dumps the database, copies new uploads, records the manifest, and then
 * deletes expired backups.
 */
export async function takeBackup({
  databaseUrl,
  files,
  backups,
  now = new Date(),
  log = console.log,
}: {
  databaseUrl: string;
  files: Storage;
  backups: Storage;
  now?: Date;
  log?: Log;
}): Promise<Manifest> {
  const id = backupId(now);
  await backups.ensureBucket();
  const manifest = await withTempDir(async (dir) => {
    const file = path.join(dir, "database.dump");
    log(`Backup ${id}: dumping the database`);
    const dump = await dumpDatabase(databaseUrl, file);
    const { size } = await stat(file);
    const checksum = await sha256(file);
    await backups.writeFile(dumpKey(id), file, "application/octet-stream");
    log(`Backup ${id}: copying uploads`);
    const { names, copied } = await copyMissing(
      files,
      "",
      backups,
      FILES_PREFIX,
    );
    log(`Backup ${id}: ${copied} new upload(s), ${names.length} in all`);
    const manifest: Manifest = {
      id,
      createdAt: now.toISOString(),
      tables: dump.tables,
      lastMigration: dump.lastMigration,
      dumpBytes: size,
      dumpSha256: checksum,
      fileKeys: names.sort(),
    };
    // Last: only now does the backup exist.
    await backups.writeText(
      manifestKey(id),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "application/json",
    );
    return manifest;
  });
  const pruned = await pruneBackups(backups, now);
  if (pruned.length > 0) log(`Deleted expired backups: ${pruned.join(", ")}`);
  log(
    `Backup ${id}: done (${manifest.dumpBytes} bytes, ${Object.keys(manifest.tables).length} tables)`,
  );
  return manifest;
}

export type RestoreReport = {
  manifest: Manifest;
  database: string;
  tables: number;
  rows: number;
  /** Uploads copied into the files bucket, when one was named. */
  filesCopied: number | null;
};

/**
 * Restores backup `id` into the new database `database`, checks its
 * checksum and every table's row count, and, when `filesTo` is given,
 * copies the uploads it lacks into that bucket.
 */
export async function restoreBackup({
  databaseUrl,
  backups,
  id,
  database,
  filesTo,
  log = console.log,
}: {
  databaseUrl: string;
  backups: Storage;
  id: string;
  database: string;
  filesTo?: Storage;
  log?: Log;
}): Promise<RestoreReport> {
  const manifest = parseManifest(await backups.readText(manifestKey(id)));
  const counts = await withTempDir(async (dir) => {
    const file = path.join(dir, "database.dump");
    log(`Restore ${id}: downloading the dump`);
    await backups.readToFile(dumpKey(id), file);
    const { size } = await stat(file);
    if (
      size !== manifest.dumpBytes ||
      (await sha256(file)) !== manifest.dumpSha256
    ) {
      throw new Error(
        `The dump of backup ${id} does not match its manifest; it may be damaged.`,
      );
    }
    log(`Restore ${id}: restoring into the new database ${database}`);
    return restoreDatabase(databaseUrl, database, file);
  });
  const differences = countDifferences(manifest.tables, counts);
  if (differences.length > 0) {
    throw new Error(
      `The restored database ${database} does not match backup ${id}:\n- ${differences.join("\n- ")}`,
    );
  }
  let filesCopied: number | null = null;
  if (filesTo) {
    log(`Restore ${id}: copying uploads into ${filesTo.bucket}`);
    await filesTo.ensureBucket();
    // Only this backup's uploads: later ones are not in its database, and
    // files since removed must not come back.
    filesCopied = (
      await copyMissing(
        backups,
        FILES_PREFIX,
        filesTo,
        "",
        new Set(manifest.fileKeys),
      )
    ).copied;
  }
  return {
    manifest,
    database,
    tables: Object.keys(counts).length,
    rows: Object.values(counts).reduce((sum, count) => sum + count, 0),
    filesCopied,
  };
}
