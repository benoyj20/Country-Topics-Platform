import {
  type AppEnvironment,
  checkServiceAddress,
  checkSiteAddress,
  readAppEnvironment,
} from "@countrytopics/environment";
import { DEFAULT_QUEUE_PREFIX } from "@countrytopics/jobs";
import {
  type ErrorReportingConfig,
  readErrorReporting,
} from "@countrytopics/observability";

// Worker configuration, from environment variables only. Errors name the
// variable, never its value.

export type WorkerEnv = {
  /** APP_ENV: which environment this process belongs to (ADR 0014). */
  environment: AppEnvironment;
  redisUrl: string;
  queuePrefix: string;
  smtpUrl: string;
  emailFrom: string;
  databaseUrl: string;
  /** Named in requests to outside services, with the contact address. */
  siteUrl: string;
  contactEmail?: string;
  /** Optional: Google Books as a backup when Open Library does not know an ISBN. */
  googleBooksApiKey?: string;
  /** Optional: the YouTube Data API adds video lengths and age restrictions. */
  youtubeApiKey?: string;
  /** Unset when the Wayback Machine may only be searched, not asked to save. */
  wayback?: { accessKey: string; secretKey: string };
  /** Sentry (SENTRY_DSN, SENTRY_ENVIRONMENT); unset turns it off. */
  errorReporting?: ErrorReportingConfig;
};

export { DEFAULT_QUEUE_PREFIX };

const QUEUE_PREFIX_PATTERN = /^[a-z0-9-]+$/;

type Env = Record<string, string | undefined>;

function readWayback(env: Env, problems: string[]): WorkerEnv["wayback"] {
  const accessKey = env.WAYBACK_ACCESS_KEY?.trim() ?? "";
  const secretKey = env.WAYBACK_SECRET_KEY?.trim() ?? "";
  if (!accessKey && !secretKey) return undefined;
  if (!accessKey || !secretKey) {
    problems.push(
      "WAYBACK_ACCESS_KEY and WAYBACK_SECRET_KEY must be set together",
    );
    return undefined;
  }
  return { accessKey, secretKey };
}

export function readWorkerEnv(env: Env = process.env): WorkerEnv {
  const problems: string[] = [];
  const environment = readAppEnvironment(env, problems);

  const redisUrl = env.REDIS_URL?.trim() ?? "";
  if (!/^rediss?:\/\//.test(redisUrl)) {
    problems.push("REDIS_URL must be a redis:// or rediss:// URL");
  }

  const smtpUrl = env.SMTP_URL?.trim() ?? "";
  if (!/^smtps?:\/\//.test(smtpUrl)) {
    problems.push("SMTP_URL must be an smtp:// or smtps:// URL");
  }

  const emailFrom = env.EMAIL_FROM?.trim() ?? "";
  if (!emailFrom.includes("@")) {
    problems.push(
      'EMAIL_FROM must be a sender address, such as "Country Topics <no-reply@example.org>"',
    );
  }

  const queuePrefix = env.QUEUE_PREFIX?.trim() || DEFAULT_QUEUE_PREFIX;
  if (!QUEUE_PREFIX_PATTERN.test(queuePrefix)) {
    problems.push(
      "QUEUE_PREFIX may contain only lowercase letters, digits, and hyphens",
    );
  }

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push("DATABASE_URL must be a postgres:// connection URL");
  }

  const siteUrl = env.SITE_URL?.trim() ?? "";
  if (!/^https?:\/\/[^/\s]+\/?$/.test(siteUrl)) {
    problems.push(
      "SITE_URL must be an http(s) origin, such as http://localhost:3000",
    );
  }

  const contactEmail = env.CONTACT_EMAIL?.trim() || undefined;
  if (contactEmail && !/^[^@\s]+@[^@\s]+$/.test(contactEmail)) {
    problems.push("CONTACT_EMAIL must be empty or an email address");
  }

  const wayback = readWayback(env, problems);
  const errorReporting = readErrorReporting(env, problems);

  checkSiteAddress(environment, "SITE_URL", siteUrl, problems);
  checkServiceAddress(environment, "REDIS_URL", redisUrl, problems);
  checkServiceAddress(environment, "SMTP_URL", smtpUrl, problems);
  checkServiceAddress(environment, "DATABASE_URL", databaseUrl, problems);

  if (problems.length > 0) {
    throw new Error(
      `Invalid worker configuration:\n- ${problems.join("\n- ")}`,
    );
  }
  return {
    environment,
    redisUrl,
    queuePrefix,
    smtpUrl,
    emailFrom,
    databaseUrl,
    siteUrl: siteUrl.replace(/\/$/, ""),
    contactEmail,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY?.trim() || undefined,
    youtubeApiKey: env.YOUTUBE_API_KEY?.trim() || undefined,
    wayback,
    errorReporting,
  };
}
