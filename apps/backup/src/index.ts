import { backupDue, isBackupId } from "./catalog.ts";
import { listBackups, restoreBackup, takeBackup } from "./backups.ts";
import { type BackupEnv, readBackupEnv } from "./env.ts";
import { createStorage, type Storage } from "./storage.ts";

// The backup command (ADR 0012), run in its container:
//   schedule                               keep taking a backup once a day
//   run                                    take one backup now
//   list                                   list the backups, newest first
//   restore <id> <database> [--files-bucket <bucket>]
//                                          restore into a new database

/** How often the scheduler checks whether a backup is due. */
const CHECK_EVERY_MS = 60 * 60 * 1_000;

const USAGE = `Usage:
  schedule
  run
  list
  restore <backup id> <new database> [--files-bucket <bucket>]`;

type Context = {
  env: BackupEnv;
  files: Storage;
  backups: Storage;
};

async function schedule({ env, files, backups }: Context): Promise<void> {
  let stopping = false;
  let wake: (() => void) | undefined;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopping = true;
      wake?.();
    });
  }
  console.log("Backups: checking every hour; one is taken each day");
  while (!stopping) {
    try {
      const [newest] = await listBackups(backups);
      if (backupDue(newest, new Date())) {
        await takeBackup({ databaseUrl: env.databaseUrl, files, backups });
      }
    } catch (error) {
      // Tried again at the next check; the error is in the container's log.
      console.error(
        "Backup failed:",
        error instanceof Error ? error.message : error,
      );
    }
    // The timer keeps the process alive between checks; a stop signal
    // ends the wait early.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CHECK_EVERY_MS);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

async function list({ backups }: Context): Promise<void> {
  const manifests = await listBackups(backups);
  if (manifests.length === 0) {
    console.log("No backups yet.");
    return;
  }
  for (const manifest of manifests) {
    const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
    console.log(
      `${manifest.id}  ${(manifest.dumpBytes / 1024).toFixed(0)} KB  ${rows} rows  ${manifest.files} uploads  migration ${manifest.lastMigration ?? "none"}`,
    );
  }
}

async function restore(
  { env, backups }: Context,
  args: string[],
): Promise<void> {
  const [id, database, flag, filesBucket] = args;
  if (!id || !isBackupId(id) || !database) throw new Error(USAGE);
  if (flag !== undefined && (flag !== "--files-bucket" || !filesBucket)) {
    throw new Error(USAGE);
  }
  const filesTo = filesBucket
    ? createStorage({ ...env.files, bucket: filesBucket })
    : undefined;
  try {
    const report = await restoreBackup({
      databaseUrl: env.databaseUrl,
      backups,
      id,
      database,
      filesTo,
    });
    console.log(
      `Restored backup ${id} into ${report.database}: ${report.tables} tables and ${report.rows} rows, matching the backup.`,
    );
    if (report.filesCopied !== null) {
      console.log(
        `Copied ${report.filesCopied} upload(s) into ${filesBucket}.`,
      );
    }
    console.log(
      `Its newest migration is ${report.manifest.lastMigration ?? "none"}.`,
    );
  } finally {
    filesTo?.close();
  }
}

const [command, ...args] = process.argv.slice(2);
let context: Context | undefined;
try {
  const env = readBackupEnv();
  context = {
    env,
    files: createStorage(env.files),
    backups: createStorage(env.backups),
  };
  if (command === "schedule") await schedule(context);
  else if (command === "run") {
    const { files, backups } = context;
    await takeBackup({ databaseUrl: env.databaseUrl, files, backups });
  } else if (command === "list") await list(context);
  else if (command === "restore") await restore(context, args);
  else throw new Error(USAGE);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  context?.files.close();
  context?.backups.close();
}
