import { normalizeEmail } from "@countrytopics/domain";

import { isTurnstileTestSecret } from "@/auth/turnstile-shared";

// Server configuration comes only from environment variables (AGENTS.md, "Build
// for scale"). Errors name the variable, never its value.

export type ServerEnv = {
  databaseUrl: string;
  /** Unset when reads should use the primary database. */
  databaseReplicaUrl?: string;
  payloadSecret: string;
  /** The site's public origin, such as `http://localhost:3000`; no trailing slash. */
  siteUrl: string;
  betterAuthSecret: string;
  /** Unset when Google sign-in is not configured. */
  google?: { clientId: string; clientSecret: string };
  /** Normalised addresses that always get the admin role. */
  adminEmails: string[];
  /** Feature flag: only invited addresses may create accounts. */
  inviteOnly: boolean;
  redisUrl: string;
  queuePrefix: string;
  /** S3-compatible storage for uploads. */
  storage: StorageEnv;
  /** Named in requests to bibliographic services; optional. */
  contactEmail?: string;
  /** Optional: Google Books as a backup when Open Library does not know an ISBN. */
  googleBooksApiKey?: string;
  /** Cloudflare Turnstile on the email sign-in form; unset turns it off. */
  turnstile?: { siteKey: string; secretKey: string };
  /**
   * The header in which the proxy in front of the site passes the client's
   * address, such as `cf-connecting-ip`; Better Auth's sign-in rate limits
   * count per address. Unset: a single-address `x-forwarded-for`.
   */
  clientIpHeader?: string;
};

export type StorageEnv = {
  /** Unset for AWS itself; set for other S3-compatible services. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Login tokens and sessions are signed with these secrets; shorter values are guessable. */
export const MIN_SECRET_LENGTH = 32;
export const DEFAULT_QUEUE_PREFIX = "countrytopics";

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
const REDIS_URL_PATTERN = /^rediss?:\/\//;
const QUEUE_PREFIX_PATTERN = /^[a-z0-9-]+$/;
// AWS bucket naming rules, which other S3-compatible services follow.
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const DEFAULT_S3_REGION = "us-east-1";

type Env = Record<string, string | undefined>;

function readSecret(env: Env, name: string, problems: string[]): string {
  const value = env[name]?.trim() ?? "";
  if (value.length < MIN_SECRET_LENGTH) {
    problems.push(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters; leave it empty in .env and run "make env" to generate one`,
    );
  }
  return value;
}

function readSiteUrl(env: Env, problems: string[]): string {
  const value = env.SITE_URL?.trim() ?? "";
  try {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/"
    ) {
      return url.origin;
    }
  } catch {
    // Reported below.
  }
  problems.push(
    "SITE_URL must be an http(s) origin, such as http://localhost:3000",
  );
  return value;
}

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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

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
  // through on a real site.
  if (
    isTurnstileTestSecret(secretKey) &&
    URL.canParse(siteUrl) &&
    !LOCAL_HOSTNAMES.has(new URL(siteUrl).hostname)
  ) {
    problems.push(
      "TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which work only when SITE_URL is localhost",
    );
  }
  return { siteKey, secretKey };
}

function readClientIpHeader(env: Env, problems: string[]): string | undefined {
  const value = env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;
  if (value && !/^[a-z0-9-]+$/.test(value)) {
    problems.push(
      "CLIENT_IP_HEADER must be empty or a header name, such as cf-connecting-ip",
    );
  }
  return value;
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
  const betterAuthSecret = readSecret(env, "BETTER_AUTH_SECRET", problems);
  const google = readGoogle(env, problems);
  const adminEmails = readAdminEmails(env, problems);
  const inviteOnly = readInviteOnly(env, problems);

  const redisUrl = env.REDIS_URL?.trim() ?? "";
  if (!REDIS_URL_PATTERN.test(redisUrl)) {
    problems.push("REDIS_URL must be a redis:// or rediss:// URL");
  }

  const queuePrefix = env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX;
  if (!QUEUE_PREFIX_PATTERN.test(queuePrefix)) {
    problems.push(
      "QUEUE_PREFIX may contain only lowercase letters, digits, and hyphens",
    );
  }

  const storage = readStorage(env, problems);
  const turnstile = readTurnstile(env, siteUrl, problems);
  const clientIpHeader = readClientIpHeader(env, problems);

  const contactEmail = env.CONTACT_EMAIL?.trim() || undefined;
  if (contactEmail && !/^[^@\s]+@[^@\s]+$/.test(contactEmail)) {
    problems.push("CONTACT_EMAIL must be empty or an email address");
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
    betterAuthSecret,
    google,
    adminEmails,
    inviteOnly,
    redisUrl,
    queuePrefix,
    storage,
    contactEmail,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY?.trim() || undefined,
    turnstile,
    clientIpHeader,
  };
}

let cachedEnv: ServerEnv | undefined;

/** The validated configuration for this process, read once. */
export function serverEnv(): ServerEnv {
  cachedEnv ??= readServerEnv();
  return cachedEnv;
}
