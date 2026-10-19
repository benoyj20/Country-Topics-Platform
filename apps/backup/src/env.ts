import {
  type ErrorReportingConfig,
  readErrorReporting,
} from "@countrytopics/observability";

// Backup configuration, from environment variables only (AGENTS.md). Errors
// name the variable, never its value.

export type S3Location = {
  /** Unset for AWS itself; set for other S3-compatible services. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type BackupEnv = {
  /** The database to back up: the site's primary (DATABASE_URL). */
  databaseUrl: string;
  /** Where uploads live (the site's S3_* settings). */
  files: S3Location;
  /**
   * Where backups go (BACKUP_S3_*). Each setting falls back to the site's,
   * so locally only the bucket differs; off the PC it should be another
   * service, so one failure cannot take both.
   */
  backups: S3Location;
  /** Sentry (SENTRY_DSN, SENTRY_ENVIRONMENT); unset turns it off. */
  errorReporting?: ErrorReportingConfig;
};

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
// AWS bucket naming rules, which other S3-compatible services follow.
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const DEFAULT_S3_REGION = "us-east-1";

type Env = Record<string, string | undefined>;

function readLocation(
  env: Env,
  prefix: string,
  fallback: S3Location | undefined,
  problems: string[],
): S3Location {
  const value = (name: string) => env[`${prefix}${name}`]?.trim() || undefined;
  const endpoint = value("ENDPOINT") ?? fallback?.endpoint;
  if (endpoint && !/^https?:\/\/\S+$/.test(endpoint)) {
    problems.push(`${prefix}ENDPOINT must be empty (AWS) or an http(s) URL`);
  }
  // Another service needs its own keys: the site's must never be sent to it.
  const sameService = !fallback || endpoint === fallback.endpoint;
  if (
    !sameService &&
    (!value("ACCESS_KEY_ID") || !value("SECRET_ACCESS_KEY"))
  ) {
    problems.push(
      `${prefix}ACCESS_KEY_ID and ${prefix}SECRET_ACCESS_KEY must be set when ${prefix}ENDPOINT names another service`,
    );
  }
  const bucket = value("BUCKET") ?? "";
  if (!BUCKET_PATTERN.test(bucket)) {
    problems.push(
      `${prefix}BUCKET must be a bucket name: 3-63 lowercase letters, digits, dots, or hyphens`,
    );
  }
  const keys = sameService ? fallback : undefined;
  const accessKeyId = value("ACCESS_KEY_ID") ?? keys?.accessKeyId ?? "";
  const secretAccessKey =
    value("SECRET_ACCESS_KEY") ?? keys?.secretAccessKey ?? "";
  if (!accessKeyId || !secretAccessKey) {
    problems.push(
      `${prefix}ACCESS_KEY_ID and ${prefix}SECRET_ACCESS_KEY must be set`,
    );
  }
  return {
    endpoint,
    region: value("REGION") ?? fallback?.region ?? DEFAULT_S3_REGION,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

export function readBackupEnv(env: Env = process.env): BackupEnv {
  const problems: string[] = [];
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!POSTGRES_URL_PATTERN.test(databaseUrl)) {
    problems.push("DATABASE_URL must be a postgres:// connection URL");
  }
  const files = readLocation(env, "S3_", undefined, problems);
  const backups = readLocation(env, "BACKUP_S3_", files, problems);
  const errorReporting = readErrorReporting(env, problems);
  if (
    !problems.length &&
    backups.bucket === files.bucket &&
    backups.endpoint === files.endpoint
  ) {
    problems.push(
      "BACKUP_S3_BUCKET must differ from S3_BUCKET, so backups stay apart from the site's files",
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Invalid backup configuration:\n- ${problems.join("\n- ")}`,
    );
  }
  return { databaseUrl, files, backups, errorReporting };
}
