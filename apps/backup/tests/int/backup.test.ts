import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import { Readable } from "node:stream";
import pg from "pg";

import { listBackups, restoreBackup, takeBackup } from "../../src/backups.ts";
import { dumpKey } from "../../src/catalog.ts";
import { withDatabase } from "../../src/postgres.ts";
import { createStorage, type Storage } from "../../src/storage.ts";

// A real backup and restore (ADR 0012): pg_dump and pg_restore against the
// test server, and S3-compatible storage. Needs the PostgreSQL 17 client
// tools, so it runs in the backup image locally (make test-backup) and on
// CI after installing them. It uses its own databases and buckets, with
// made-up rows, and never the site's.

const serverUrl = process.env.TEST_DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(serverUrl)) {
  throw new Error("TEST_DATABASE_URL must be set to the test server");
}
const SOURCE = "countrytopics_backup_source";
const RESTORED = "countrytopics_backup_restored";
const DAY_MS = 24 * 60 * 60 * 1_000;
const silent = () => undefined;

function location(bucket: string) {
  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "us-east-1",
    bucket,
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  };
}

const files = createStorage(location("countrytopics-backup-test-files"));
const backups = createStorage(location("countrytopics-backup-test-backups"));
const restoredFiles = createStorage(
  location("countrytopics-backup-test-restored"),
);
const sourceUrl = withDatabase(serverUrl, SOURCE);

async function onServer(sql: string): Promise<void> {
  const client = new pg.Client({
    connectionString: withDatabase(serverUrl, "postgres"),
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function empty(storage: Storage): Promise<void> {
  await storage.ensureBucket();
  const keys: string[] = [];
  for await (const item of storage.list("")) keys.push(item.key);
  await storage.remove(keys);
}

async function keysOf(storage: Storage, prefix = ""): Promise<string[]> {
  const keys: string[] = [];
  for await (const item of storage.list(prefix)) keys.push(item.key);
  return keys.sort();
}

before(async () => {
  for (const name of [SOURCE, RESTORED]) {
    await onServer(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
  await onServer(`CREATE DATABASE ${SOURCE}`);
  const client = new pg.Client({ connectionString: sourceUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE topics (id serial PRIMARY KEY, title text NOT NULL);
      CREATE TABLE comments (
        id serial PRIMARY KEY,
        topic_id int REFERENCES topics (id),
        body text NOT NULL
      );
      CREATE TABLE payload_migrations (id serial PRIMARY KEY, name text);
      INSERT INTO topics (title) VALUES ('TEST topic one'), ('TEST topic two');
      INSERT INTO comments (topic_id, body)
        SELECT 1, 'TEST comment ' || n FROM generate_series(1, 25) AS n;
      INSERT INTO payload_migrations (name)
        VALUES ('20261001_000000_first'), ('20261002_000000_second');
    `);
  } finally {
    await client.end();
  }
  for (const storage of [files, backups, restoredFiles]) await empty(storage);
  const upload = Buffer.from("TEST uploaded file");
  await files.write(
    "test-upload.txt",
    Readable.from(upload),
    upload.length,
    "text/plain",
  );
});

after(async () => {
  for (const name of [SOURCE, RESTORED]) {
    await onServer(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
  for (const storage of [files, backups, restoredFiles]) storage.close();
});

describe("the backup command", () => {
  it("starts and lists backups, as its container runs it", async () => {
    // The real entry point, so a module that cannot load in the image fails
    // here rather than in production.
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["src/index.ts", "list"],
      {
        env: {
          ...process.env,
          DATABASE_URL: sourceUrl,
          S3_BUCKET: files.bucket,
          BACKUP_S3_BUCKET: backups.bucket,
          SENTRY_DSN: "",
        },
      },
    );
    assert.match(stdout, /No backups yet\.|\d{4}-\d{2}-\d{2}T/);
  });
});

describe("backups", () => {
  it("dump the database with its row counts and copy the uploads", async () => {
    const manifest = await takeBackup({
      databaseUrl: sourceUrl,
      files,
      backups,
      log: silent,
    });
    assert.deepEqual(manifest.tables, {
      comments: 25,
      payload_migrations: 2,
      topics: 2,
    });
    assert.equal(manifest.lastMigration, "20261002_000000_second");
    assert.deepEqual(manifest.fileKeys, ["test-upload.txt"]);
    assert.deepEqual(await keysOf(backups, "files/"), [
      "files/test-upload.txt",
    ]);
    assert.deepEqual(
      (await listBackups(backups)).map((item) => item.id),
      [manifest.id],
    );
  });

  it("restore into a new database, matching every table, with the uploads", async () => {
    const [newest] = await listBackups(backups);
    assert.ok(newest);
    const report = await restoreBackup({
      databaseUrl: serverUrl,
      backups,
      id: newest.id,
      database: RESTORED,
      filesTo: restoredFiles,
      log: silent,
    });
    assert.equal(report.tables, 3);
    assert.equal(report.rows, 29);
    assert.equal(report.filesCopied, 1);
    assert.deepEqual(await keysOf(restoredFiles), ["test-upload.txt"]);
    const client = new pg.Client({
      connectionString: withDatabase(serverUrl, RESTORED),
    });
    await client.connect();
    try {
      const { rows } = await client.query(
        "SELECT body FROM comments ORDER BY id LIMIT 1",
      );
      assert.deepEqual(rows, [{ body: "TEST comment 1" }]);
    } finally {
      await client.end();
    }
  });

  it("refuse the live database, an existing one, and a damaged dump", async () => {
    const [newest] = await listBackups(backups);
    assert.ok(newest);
    const attempt = (database: string, url = serverUrl) =>
      restoreBackup({
        databaseUrl: url,
        backups,
        id: newest.id,
        database,
        log: silent,
      });
    await assert.rejects(attempt(SOURCE, sourceUrl), /never over the live one/);
    await assert.rejects(attempt(RESTORED), /already exists/);
    await assert.rejects(attempt("Bad-Name"), /lowercase/);

    const damaged = Buffer.from("not a dump");
    await backups.write(
      dumpKey(newest.id),
      Readable.from(damaged),
      damaged.length,
    );
    await assert.rejects(
      attempt("countrytopics_backup_never_made"),
      /does not match its manifest/,
    );
  });

  it("copy each upload once and delete backups past their retention, with the uploads only they listed", async () => {
    // An upload removed from the site after the old backup listed it.
    const removed = Buffer.from("TEST removed later");
    await files.write(
      "removed-later.txt",
      Readable.from(removed),
      removed.length,
      "text/plain",
    );
    const old = await takeBackup({
      databaseUrl: sourceUrl,
      files,
      backups,
      now: new Date(Date.now() - 20 * DAY_MS),
      log: silent,
    });
    assert.ok(old.fileKeys.includes("removed-later.txt"));
    await files.remove(["removed-later.txt"]);
    const messages: string[] = [];
    const fresh = await takeBackup({
      databaseUrl: sourceUrl,
      files,
      backups,
      log: (message) => messages.push(message),
    });
    assert.ok(messages.some((message) => message.includes("0 new upload(s)")));
    const ids = (await listBackups(backups)).map((item) => item.id);
    assert.ok(ids.includes(fresh.id));
    assert.ok(!ids.includes(old.id));
    assert.ok(!(await keysOf(backups, "db/")).includes(dumpKey(old.id)));
    // No kept backup lists the removed upload, so its copy is gone too.
    assert.deepEqual(await keysOf(backups, "files/"), [
      "files/test-upload.txt",
    ]);
  });
});
