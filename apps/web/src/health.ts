import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

export type HealthStatus = "ok" | "unavailable";

export type HealthDependencies = {
  pingDatabase: () => Promise<unknown>;
  logError: (error: unknown) => void;
};

/** Readiness for load balancers: the app is up and the primary database answers. */
export async function checkHealth({
  pingDatabase,
  logError,
}: HealthDependencies): Promise<HealthStatus> {
  try {
    await pingDatabase();
    return "ok";
  } catch (error) {
    logError(error);
    return "unavailable";
  }
}

export function payloadHealthDependencies(
  payload: Payload,
): HealthDependencies {
  return {
    pingDatabase: () => payload.db.drizzle.execute(sql`select 1`),
    logError: (error) =>
      payload.logger.error({
        err: error,
        msg: "Health check: database query failed",
      }),
  };
}
