import { normalizeEmail } from "@countrytopics/domain";
import {
  checkServiceAddress,
  checkSiteAddress,
  errorEnvironmentFor,
  isLoopbackHostname,
  MIN_SECRET_LENGTH,
  readAppEnvironment,
  readBackendUrl,
  readSecret,
  readSiteUrl,
} from "@countrytopics/environment";
import { DEFAULT_QUEUE_PREFIX } from "@countrytopics/jobs";
import {
  type ErrorReportingConfig,
  readErrorReporting,
} from "@countrytopics/observability";

import { isTurnstileTestSecret } from "@/auth/turnstile-shared";

// Server configuration comes only from environment variables (AGENTS.md, "Build
// for scale"). Errors name the variable, never its value.

export type ServerEnv = {
  databaseUrl: string;
  /** Unset when reads should use the primary database. */
  databaseReplicaUrl?: string;
  payloadSecret: string;
  /**
   * The site's public origin, such as `http://localhost:3000`; no trailing
   * slash. Since ADR 0014 it is the frontend's: browsers reach this
   * backend only through it.
   */
  siteUrl: string;
  /** This backend's own origin, such as `http://localhost:3002`. */
  backendUrl: string;
  /**
   * Locally only, where staff use Payload's panel at the backend's own
   * address until ADR 0014's phase 12: that origin, from which unsigned
   * requests and writes are accepted. Unset in every hosted environment.
   */
  panelOrigin?: string;
  /** The key the frontend signs every request it passes on with. */
  forwardingKey: string;
  betterAuthSecret: string;
  /** Unset when Google sign-in is not configured. */
  google?: { clientId: string; clientSecret: string };
  /** Normalised addresses that always get the admin role. */
  adminEmails: string[];
  /** Feature flag: only invited addresses may create accounts. */
  inviteOnly: boolean;
  redisUrl: string;
  /**
   * The page cache's own Valkey, which may evict (cache-handler.mjs);
   * unset uses REDIS_URL.
   */
  pageCacheUrl?: string;
  queuePrefix: string;
  /** S3-compatible storage for uploads. */
  storage: StorageEnv;
  /**
   * Named in requests to bibliographic services, and the contact address
   * on the privacy policy and terms; optional.
   */
  contactEmail?: string;
  /** Who runs the site, as the privacy policy and terms name them; optional. */
  siteOperator?: string;
  /** Optional: Google Books as a backup when Open Library does not know an ISBN. */
  googleBooksApiKey?: string;
  /** Cloudflare Turnstile on the email sign-in form; unset turns it off. */
  turnstile?: { siteKey: string; secretKey: string };
  /** Sentry (SENTRY_DSN, SENTRY_ENVIRONMENT); unset turns it off. */
  errorReporting?: ErrorReportingConfig;
};

export type StorageEnv = {
  /** Unset for AWS itself; set for other S3-compatible services. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export { DEFAULT_QUEUE_PREFIX, MIN_SECRET_LENGTH };

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
const REDIS_URL_PATTERN = /^rediss?:\/\//;
const QUEUE_PREFIX_PATTERN = /^[a-z0-9-]+$/;
// AWS bucket naming rules, which other S3-compatible services follow.
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const DEFAULT_S3_REGION = "us-east-1";
const SITE_OPERATOR_MAX_LENGTH = 200;

type Env = Record<string, string | undefined>;

function readGoogle(env: Env, problems: string[]): ServerEnv["google"] {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId && !clientSecret) return undefined;
  if (!clientId || !clientSecret) {
    problems.push(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    );
    return undefined;
  }
  return { clientId, clientSecret };
}

function readAdminEmails(env: Env, problems: string[]): string[] {
  const emails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  if (emails.some((email) => !/^[^@\s]+@[^@\s]+$/.test(email))) {
    problems.push(
      "ADMIN_EMAILS must be a comma-separated list of email addresses",
    );
  }
  return emails;
}

function readInviteOnly(env: Env, problems: string[]): boolean {
  const value = env.INVITE_ONLY?.trim().toLowerCase() ?? "";
  if (value === "" || value === "true") return true;
  if (value === "false") return false;
  problems.push('INVITE_ONLY must be "true" or "false"');
  return true;
}

function readTurnstile(
  env: Env,
  siteUrl: string,
  problems: string[],
): ServerEnv["turnstile"] {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!siteKey && !secretKey) return undefined;
  if (!siteKey || !secretKey) {
    problems.push(
      "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must be set together",
    );
    return undefined;
  }
  // Test keys always give the same answer, so they would let anyone
  // through on any address others can reach, a quick-tunnel demo included.
  if (
    isTurnstileTestSecret(secretKey) &&
    URL.canParse(siteUrl) &&
    !isLoopbackHostname(new URL(siteUrl).hostname)
  ) {
    problems.push(
      "TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which work only when SITE_URL is localhost; leave both Turnstile keys empty for a demo",
    );
  }
  return { siteKey, secretKey };
}

function readStorage(env: Env, problems: string[]): StorageEnv {
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  if (endpoint && !/^https?:\/\/\S+$/.test(endpoint)) {
    problems.push("S3_ENDPOINT must be empty (AWS) or an http(s) URL");
  }
  const region = env.S3_REGION?.trim() || DEFAULT_S3_REGION;
  const bucket = env.S3_BUCKET?.trim() ?? "";
  if (!BUCKET_PATTERN.test(bucket)) {
    problems.push(
      "S3_BUCKET must be a bucket name: 3-63 lowercase letters, digits, dots, or hyphens",
    );
  }
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!accessKeyId || !secretAccessKey) {
    problems.push("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set");
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function readServerEnv(env: Env = process.env): ServerEnv {
  const problems: string[] = [];
  const environment = readAppEnvironment(env, problems);

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!POSTGRES_URL_PATTERN.test(databaseUrl)) {
    problems.push("DATABASE_URL must be a postgres:// connection URL");
  }

  const replicaUrl = env.DATABASE_REPLICA_URL?.trim() ?? "";
  if (replicaUrl && !POSTGRES_URL_PATTERN.test(replicaUrl)) {
    problems.push(
      "DATABASE_REPLICA_URL must be empty or a postgres:// connection URL",
    );
  }

  const payloadSecret = readSecret(env, "PAYLOAD_SECRET", problems);
  const siteUrl = readSiteUrl(env, problems);
  const backendUrl = readBackendUrl(env, siteUrl, problems);
  const forwardingKey = readSecret(env, "FORWARDING_KEY", problems);
  const betterAuthSecret = readSecret(env, "BETTER_AUTH_SECRET", problems);
  const google = readGoogle(env, problems);
  const adminEmails = readAdminEmails(env, problems);
  const inviteOnly = readInviteOnly(env, problems);

  const redisUrl = env.REDIS_URL?.trim() ?? "";
  if (!REDIS_URL_PATTERN.test(redisUrl)) {
    problems.push("REDIS_URL must be a redis:// or rediss:// URL");
  }

  const pageCacheUrl = env.PAGE_CACHE_URL?.trim() || undefined;
  if (pageCacheUrl && !REDIS_URL_PATTERN.test(pageCacheUrl)) {
    problems.push(
      "PAGE_CACHE_URL must be empty or a redis:// or rediss:// URL",
    );
  }

  const queuePrefix = env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX;
  if (!QUEUE_PREFIX_PATTERN.test(queuePrefix)) {
    problems.push(
      "QUEUE_PREFIX may contain only lowercase letters, digits, and hyphens",
    );
  }

  const storage = readStorage(env, problems);
  const turnstile = readTurnstile(env, siteUrl, problems);
  const errorReporting = readErrorReporting(
    env,
    problems,
    errorEnvironmentFor(environment),
  );

  checkSiteAddress(environment, "SITE_URL", siteUrl, problems);
  checkServiceAddress(environment, "BACKEND_URL", backendUrl, problems);
  checkServiceAddress(environment, "DATABASE_URL", databaseUrl, problems);
  checkServiceAddress(
    environment,
    "DATABASE_REPLICA_URL",
    replicaUrl,
    problems,
  );
  checkServiceAddress(environment, "REDIS_URL", redisUrl, problems);
  checkServiceAddress(environment, "PAGE_CACHE_URL", pageCacheUrl, problems);
  checkServiceAddress(environment, "S3_ENDPOINT", storage.endpoint, problems);

  const contactEmail = env.CONTACT_EMAIL?.trim() || undefined;
  if (contactEmail && !/^[^@\s]+@[^@\s]+$/.test(contactEmail)) {
    problems.push("CONTACT_EMAIL must be empty or an email address");
  }

  const siteOperator = env.SITE_OPERATOR?.trim() || undefined;
  if (siteOperator && siteOperator.length > SITE_OPERATOR_MAX_LENGTH) {
    problems.push(
      `SITE_OPERATOR must be at most ${SITE_OPERATOR_MAX_LENGTH} characters`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid server configuration:\n- ${problems.join("\n- ")}`,
    );
  }

  return {
    databaseUrl,
    // Locally the replica URL points at the primary; treat that as "no replica"
    // so Payload does not open a second pool to the same database.
    databaseReplicaUrl:
      replicaUrl && replicaUrl !== databaseUrl ? replicaUrl : undefined,
    payloadSecret,
    siteUrl,
    backendUrl,
    panelOrigin: environment === "local" ? backendUrl : undefined,
    forwardingKey,
    betterAuthSecret,
    google,
    adminEmails,
    inviteOnly,
    redisUrl,
    pageCacheUrl,
    queuePrefix,
    storage,
    contactEmail,
    siteOperator,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY?.trim() || undefined,
    turnstile,
    errorReporting,
  };
}

let cachedEnv: ServerEnv | undefined;

/** The validated configuration for this process, read once. */
export function serverEnv(): ServerEnv {
  cachedEnv ??= readServerEnv();
  return cachedEnv;
}
