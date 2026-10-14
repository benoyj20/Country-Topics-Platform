// Worker configuration, from environment variables only. Errors name the
// variable, never its value.

export type WorkerEnv = {
  redisUrl: string;
  queuePrefix: string;
  smtpUrl: string;
  emailFrom: string;
};

export const DEFAULT_QUEUE_PREFIX = "countrytopics";

const QUEUE_PREFIX_PATTERN = /^[a-z0-9-]+$/;

export function readWorkerEnv(
  env: Record<string, string | undefined> = process.env,
): WorkerEnv {
  const problems: string[] = [];

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

  if (problems.length > 0) {
    throw new Error(
      `Invalid worker configuration:\n- ${problems.join("\n- ")}`,
    );
  }
  return { redisUrl, queuePrefix, smtpUrl, emailFrom };
}
