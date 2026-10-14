// Server configuration comes only from environment variables (AGENTS.md, "Build
// for scale"). Errors name the variable, never its value.

export type ServerEnv = {
  databaseUrl: string;
  /** Unset when reads should use the primary database. */
  databaseReplicaUrl?: string;
  payloadSecret: string;
};

/** Payload signs login tokens with this secret; shorter values are guessable. */
export const MIN_PAYLOAD_SECRET_LENGTH = 32;

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;

export function readServerEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv {
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

  const payloadSecret = env.PAYLOAD_SECRET?.trim() ?? "";
  if (payloadSecret.length < MIN_PAYLOAD_SECRET_LENGTH) {
    problems.push(
      `PAYLOAD_SECRET must be at least ${MIN_PAYLOAD_SECRET_LENGTH} characters; run "make env" to generate one`,
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
  };
}
