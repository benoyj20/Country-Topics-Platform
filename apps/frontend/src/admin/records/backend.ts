import "server-only";

import type * as z from "zod";

import { readAsStaff } from "../backend";
import { isUuid } from "../list-state";

// What every feature's record reads share (features/*/backend.ts): one
// record from Payload's REST API, as the staff member, with the same query
// a save is answered with (packages/contracts).

/** One record of `collection`, or null when there is none. */
export async function readRecord<T>(
  collection: string,
  id: string,
  params: URLSearchParams,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (!isUuid(id)) return null;
  return readAsStaff(`/api/${collection}/${id}?${params}`, schema);
}
