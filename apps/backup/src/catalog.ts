// How backups are named, described, and kept in the backup bucket (ADR
// 0012). Pure, so the rules are tested without a database or storage.
//
// Layout:
//   db/<id>.dump   the database, in pg_dump's custom format
//   db/<id>.json   its manifest, written last: a backup without one is
//                  unfinished and is never listed or restored
//   files/<key>    a copy of each upload a kept backup lists; uploads never
//                  change once stored, so each is copied once, and deleted
//                  when no kept backup lists it any more

/**
 * How long a database backup is kept. The privacy policy states it; change
 * both together.
 */
export const BACKUP_RETENTION_DAYS = 14;
/** A backup is due when the newest is older than this. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

const DAY_MS = 24 * 60 * 60 * 1_000;
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
export const FILES_PREFIX = "files/";

export type Manifest = {
  id: string;
  createdAt: string;
  /** Rows in each table when the dump was taken, from the same snapshot. */
  tables: Record<string, number>;
  /** The newest migration applied, so a restore says what code it fits. */
  lastMigration: string | null;
  dumpBytes: number;
  dumpSha256: string;
  /** The uploads in the site's bucket when the backup was taken. */
  fileKeys: string[];
};

/** A sortable, file-name-safe id for a backup taken at `at`. */
export function backupId(at: Date): string {
  return at
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
}

export function isBackupId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export const dumpKey = (id: string) => `db/${id}.dump`;
export const manifestKey = (id: string) => `db/${id}.json`;

/** The backup id a manifest's key names, or null for any other key. */
export function idFromManifestKey(key: string): string | null {
  const match = /^db\/(.+)\.json$/.exec(key);
  return match?.[1] && isBackupId(match[1]) ? match[1] : null;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (count) => Number.isInteger(count) && (count as number) >= 0,
    )
  );
}

/** A manifest read back from storage, checked field by field. */
export function parseManifest(text: string): Manifest {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) {
    throw new Error("The manifest is not an object.");
  }
  const record = value as Record<string, unknown>;
  const {
    id,
    createdAt,
    tables,
    lastMigration,
    dumpBytes,
    dumpSha256,
    fileKeys,
  } = record;
  if (typeof id !== "string" || !isBackupId(id)) {
    throw new Error("The manifest has no valid id.");
  }
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    throw new Error("The manifest has no valid time.");
  }
  if (!isCountRecord(tables)) {
    throw new Error("The manifest's table counts are not valid.");
  }
  if (lastMigration !== null && typeof lastMigration !== "string") {
    throw new Error("The manifest's migration is not valid.");
  }
  if (!Number.isInteger(dumpBytes) || (dumpBytes as number) <= 0) {
    throw new Error("The manifest's dump size is not valid.");
  }
  if (typeof dumpSha256 !== "string" || !/^[0-9a-f]{64}$/.test(dumpSha256)) {
    throw new Error("The manifest's checksum is not valid.");
  }
  if (
    !Array.isArray(fileKeys) ||
    !fileKeys.every((key) => typeof key === "string" && key.length > 0)
  ) {
    throw new Error("The manifest's file list is not valid.");
  }
  return {
    id,
    createdAt,
    tables,
    lastMigration,
    dumpBytes: dumpBytes as number,
    dumpSha256,
    fileKeys: fileKeys as string[],
  };
}

/**
 * Upload copies (keys under files/) that no kept backup lists, so a file
 * removed from the site leaves the backups with the last backup that had
 * it.
 */
export function unusedFileCopies(copies: string[], kept: Manifest[]): string[] {
  const listed = new Set(
    kept.flatMap((manifest) =>
      manifest.fileKeys.map((key) => FILES_PREFIX + key),
    ),
  );
  return copies.filter((key) => !listed.has(key));
}

/**
 * Backups older than the retention period, oldest first. The newest is
 * always kept, so a site whose backups stopped still has its last one.
 */
export function expiredBackups(manifests: Manifest[], now: Date): Manifest[] {
  const newestFirst = [...manifests].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const cutoff = now.getTime() - BACKUP_RETENTION_DAYS * DAY_MS;
  return newestFirst
    .slice(1)
    .filter((manifest) => Date.parse(manifest.createdAt) < cutoff)
    .reverse();
}

/** Whether a new backup is due, given the newest one (if any). */
export function backupDue(newest: Manifest | undefined, now: Date): boolean {
  return (
    !newest ||
    now.getTime() - Date.parse(newest.createdAt) >= BACKUP_INTERVAL_MS
  );
}

/**
 * Whether backups have stopped: no backup, or the newest older than two
 * intervals, so one late or failed backup is not yet an alarm.
 */
export function backupOverdue(
  newest: Manifest | undefined,
  now: Date,
): boolean {
  return (
    !newest ||
    now.getTime() - Date.parse(newest.createdAt) > 2 * BACKUP_INTERVAL_MS
  );
}

/**
 * Tables whose row counts differ between a backup and its restore, as
 * sentences; empty when they all match.
 */
export function countDifferences(
  expected: Record<string, number>,
  actual: Record<string, number>,
): string[] {
  const names = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ];
  return names.sort().flatMap((name) => {
    const want = expected[name];
    const got = actual[name];
    if (want === got) return [];
    if (want === undefined) return [`${name}: not in the backup`];
    if (got === undefined) return [`${name}: missing after the restore`];
    return [`${name}: ${want} rows backed up, ${got} restored`];
  });
}
