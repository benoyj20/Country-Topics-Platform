import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BACKUP_RETENTION_DAYS,
  backupDue,
  backupId,
  backupOverdue,
  countDifferences,
  expiredBackups,
  idFromManifestKey,
  type Manifest,
  manifestKey,
  parseManifest,
  unusedFileCopies,
} from "../../src/catalog.ts";

const DAY_MS = 24 * 60 * 60 * 1_000;
const now = new Date("2026-10-18T12:00:00.000Z");

function manifest(daysAgo: number, fileKeys: string[] = []): Manifest {
  const at = new Date(now.getTime() - daysAgo * DAY_MS);
  return {
    id: backupId(at),
    createdAt: at.toISOString(),
    tables: { users: 2 },
    lastMigration: "20261018_011503_account_deletion_feedback",
    dumpBytes: 1_024,
    dumpSha256: "a".repeat(64),
    fileKeys,
  };
}

describe("backup names", () => {
  it("are sortable, safe in file names, and found again in their keys", () => {
    const id = backupId(new Date("2026-10-18T01:02:03.456Z"));
    assert.equal(id, "2026-10-18T01-02-03Z");
    assert.equal(idFromManifestKey(manifestKey(id)), id);
    assert.equal(idFromManifestKey(`db/${id}.dump`), null);
    assert.equal(idFromManifestKey("db/../secret.json"), null);
  });
});

describe("parseManifest", () => {
  it("reads back what was written", () => {
    const written = manifest(0);
    assert.deepEqual(parseManifest(JSON.stringify(written)), written);
  });

  it("refuses a damaged manifest", () => {
    const written = manifest(0);
    for (const broken of [
      { ...written, id: "../x" },
      { ...written, tables: { users: -1 } },
      { ...written, dumpSha256: "nope" },
      { ...written, dumpBytes: 0 },
      { ...written, fileKeys: [""] },
    ]) {
      assert.throws(() => parseManifest(JSON.stringify(broken)));
    }
    assert.throws(() => parseManifest("[]"));
  });
});

describe("expiredBackups", () => {
  it("deletes backups past the retention period, oldest first", () => {
    const kept = [manifest(0), manifest(BACKUP_RETENTION_DAYS - 1)];
    const old = [
      manifest(BACKUP_RETENTION_DAYS + 2),
      manifest(BACKUP_RETENTION_DAYS + 1),
    ];
    assert.deepEqual(
      expiredBackups([...kept, ...old], now).map((item) => item.id),
      [old[0]?.id, old[1]?.id],
    );
  });

  it("always keeps the newest, however old", () => {
    const only = manifest(BACKUP_RETENTION_DAYS * 3);
    assert.deepEqual(expiredBackups([only], now), []);
  });
});

describe("backupDue", () => {
  it("is due with no backup or once the newest is a day old", () => {
    assert.equal(backupDue(undefined, now), true);
    assert.equal(backupDue(manifest(0.5), now), false);
    assert.equal(backupDue(manifest(1), now), true);
  });
});

describe("backupOverdue", () => {
  it("raises the alarm only after two missed days", () => {
    assert.equal(backupOverdue(undefined, now), true);
    assert.equal(backupOverdue(manifest(1.5), now), false);
    assert.equal(backupOverdue(manifest(2.5), now), true);
  });
});

describe("unusedFileCopies", () => {
  it("finds upload copies no kept backup lists", () => {
    const kept = [manifest(0, ["a.pdf"]), manifest(3, ["a.pdf", "b.jpg"])];
    assert.deepEqual(
      unusedFileCopies(
        ["files/a.pdf", "files/b.jpg", "files/removed.jpg"],
        kept,
      ),
      ["files/removed.jpg"],
    );
  });
});

describe("countDifferences", () => {
  it("names every table that does not match", () => {
    assert.deepEqual(countDifferences({ a: 1, b: 2 }, { a: 1, b: 2 }), []);
    assert.deepEqual(countDifferences({ a: 1, b: 2 }, { a: 0, c: 1 }), [
      "a: 1 rows backed up, 0 restored",
      "b: missing after the restore",
      "c: not in the backup",
    ]);
  });
});
