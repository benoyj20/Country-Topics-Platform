import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

export type HealthStatus = "ok" | "unavailable";

/** A probe must answer quickly; a hung database counts as unavailable. */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000;

export type HealthDependencies = {
  pingDatabase: () => Promise<unknown>;
  logError: (error: unknown) => void;
  timeoutMs?: number;
};

/** Readiness for load balancers: the app is up and the primary database answers. */
export async function checkHealth({
  pingDatabase,
  logError,
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
}: HealthDependencies): Promise<HealthStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Database did not answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([pingDatabase(), timeout]);
    return "ok";
  } catch (error) {
    logError(error);
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loading Payload is part of the ping: it connects to the database on first use,
 * so a database that is down at startup must also report "unavailable".
 */
export function payloadHealthDependencies(
  loadPayload: () => Promise<Payload>,
): HealthDependencies {
  return {
    pingDatabase: async () => {
      const payload = await loadPayload();
      await payload.db.drizzle.execute(sql`select 1`);
    },
    // Payload's logger may not exist when loading Payload is what failed.
    logError: (error) => console.error("Health check failed:", error),
  };
}
