import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readBackupEnv } from "../../src/env.ts";
import { libpqEnv, withDatabase } from "../../src/postgres.ts";

const valid = {
  DATABASE_URL:
    "postgres://user:p%40ss@db.example:5433/countrytopics?sslmode=disable",
  S3_ENDPOINT: "http://storage:8333",
  S3_BUCKET: "countrytopics",
  S3_ACCESS_KEY_ID: "access",
  S3_SECRET_ACCESS_KEY: "secret",
  BACKUP_S3_BUCKET: "countrytopics-backups",
};

describe("readBackupEnv", () => {
  it("uses the site's storage settings for backups unless told otherwise", () => {
    const env = readBackupEnv(valid);
    assert.deepEqual(env.backups, {
      ...env.files,
      bucket: "countrytopics-backups",
    });
    const elsewhere = readBackupEnv({
      ...valid,
      BACKUP_S3_ENDPOINT: "https://backups.example",
      BACKUP_S3_ACCESS_KEY_ID: "other",
      BACKUP_S3_SECRET_ACCESS_KEY: "other-secret",
    });
    assert.equal(elsewhere.backups.endpoint, "https://backups.example");
    assert.equal(elsewhere.backups.accessKeyId, "other");
  });

  it("never sends the site's keys to another backup service", () => {
    assert.throws(
      () =>
        readBackupEnv({ ...valid, BACKUP_S3_ENDPOINT: "https://r2.example" }),
      /BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY must be set when BACKUP_S3_ENDPOINT names another service/,
    );
  });

  it("refuses a missing or shared backup bucket, naming the variable only", () => {
    assert.throws(
      () => readBackupEnv({ ...valid, BACKUP_S3_BUCKET: "" }),
      /BACKUP_S3_BUCKET must be a bucket name/,
    );
    assert.throws(
      () => readBackupEnv({ ...valid, BACKUP_S3_BUCKET: "countrytopics" }),
      /must differ from S3_BUCKET/,
    );
    assert.throws(
      () => readBackupEnv({ ...valid, DATABASE_URL: "mysql://x" }),
      (error: Error) =>
        /DATABASE_URL/.test(error.message) && !error.message.includes("mysql"),
    );
  });
});

describe("connection settings for the PostgreSQL tools", () => {
  it("pass the password in the environment, decoded", () => {
    assert.deepEqual(libpqEnv(valid.DATABASE_URL), {
      PGHOST: "db.example",
      PGPORT: "5433",
      PGUSER: "user",
      PGPASSWORD: "p@ss",
      PGDATABASE: "countrytopics",
      PGCONNECT_TIMEOUT: "5",
      PGSSLMODE: "disable",
    });
  });

  it("point at another database on the same server", () => {
    assert.equal(
      withDatabase(valid.DATABASE_URL, "restored"),
      "postgres://user:p%40ss@db.example:5433/restored?sslmode=disable",
    );
  });
});
