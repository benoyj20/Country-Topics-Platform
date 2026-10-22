import {
  type ApiError,
  type PublicTag,
  PURGE_BODY_MAX_BYTES,
  type PurgeAnswer,
  PurgeRequest,
} from "@countrytopics/contracts";
import { checkPurge } from "@countrytopics/forwarding";

import { readLimited } from "./read-limited.ts";

// POST /api/revalidate (app/api/revalidate): the worker's purge of this
// site's cache (ADR 0014, "Cache and purges"), sent once the backend has
// purged its own. Only a purge signed with the purge key, within five
// minutes, is carried out; the body is read only that far, and parsed only
// once its signature holds. Purging is all it can do: the next visitors
// get freshly rendered pages.

const NO_STORE = { "Cache-Control": "no-store" };

function refusal(status: number, message: string): Response {
  return Response.json({ error: message, problems: [] } satisfies ApiError, {
    status,
    headers: NO_STORE,
  });
}

const decoder = new TextDecoder();

/** Carries out a purge with `revalidate`, if the worker signed it. */
export async function purgeResponse(
  request: Request,
  purgeKey: string,
  revalidate: (tag: PublicTag) => void,
  now: number = Date.now(),
): Promise<Response> {
  const bytes = await readLimited(request, PURGE_BODY_MAX_BYTES);
  if (!bytes) return refusal(413, "The purge is too large.");
  const body = decoder.decode(bytes);
  const check = await checkPurge(purgeKey, body, request.headers, now);
  if (!check.ok) {
    console.warn(`Purge refused: ${check.reason}`);
    return refusal(403, "The purge is not signed by the worker.");
  }
  let parsed;
  try {
    parsed = PurgeRequest.safeParse(JSON.parse(body));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) return refusal(400, "The purge names no known tags.");
  for (const tag of parsed.data.tags) revalidate(tag);
  return Response.json({ purged: parsed.data.tags } satisfies PurgeAnswer, {
    headers: NO_STORE,
  });
}
