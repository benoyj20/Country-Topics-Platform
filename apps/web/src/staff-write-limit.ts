import {
  APIError,
  type CollectionBeforeOperationHook,
  type CollectionConfig,
} from "payload";

import { consumeRateLimit } from "@/rate-limit";

// How often one person may write through Payload's REST API (ADR 0014,
// "The backend: APIs only"): the admin calls it across the network now,
// so a stolen session or a runaway script is held to a staff member's
// pace. The local API, which scripts and hooks use, is not counted.

type Operation = Parameters<CollectionBeforeOperationHook>[0]["operation"];

/**
 * Operations that change records, as Payload names them in this hook (an
 * update or delete by id is "update" or "delete" here too).
 */
const WRITE_OPERATIONS: ReadonlySet<Operation> = new Set<Operation>([
  "create",
  "update",
  "delete",
  "restoreVersion",
]);

/**
 * Whether an update or delete is a bulk one, by filter rather than by id:
 * one request that may change every record of a collection.
 */
function isBulk(args: unknown): boolean {
  return (
    typeof args === "object" &&
    args !== null &&
    "where" in args &&
    !("id" in args && args.id !== undefined)
  );
}

/**
 * Set on a request once it is counted: the records a write changes in turn,
 * such as its audit log entry, share its request and are not counted again.
 */
const COUNTED = "staffWriteCounted";

const limitStaffWrites: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (
    req.payloadAPI !== "REST" ||
    !req.user ||
    !WRITE_OPERATIONS.has(operation) ||
    req.context[COUNTED]
  ) {
    return args;
  }
  req.context[COUNTED] = true;
  let result;
  try {
    result = await consumeRateLimit(
      (operation === "update" || operation === "delete") && isBulk(args)
        ? "staff-bulk-write"
        : "staff-write",
      String(req.user.id),
    );
  } catch (error) {
    console.error("Staff write limit unavailable:", error);
    throw new APIError(
      "Saving is not available right now. Try again in a moment.",
      503,
    );
  }
  if (!result.ok) {
    throw new APIError(
      `Too many saves in a short time. Try again in ${result.retryAfterS} seconds.`,
      429,
    );
  }
  return args;
};

/** `collection` with its REST writes counted against the staff limit. */
export function withStaffWriteLimit(
  collection: CollectionConfig,
): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeOperation: [
        limitStaffWrites,
        ...(collection.hooks?.beforeOperation ?? []),
      ],
    },
  };
}
