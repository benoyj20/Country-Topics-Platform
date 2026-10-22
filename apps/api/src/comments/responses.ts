import { apiError } from "@/api/json";

import { InvalidCommentCursorError } from "./cursor";
import { CommentRefusal } from "./store";

/**
 * Lists are public and the same for everyone. Shared caches may keep them
 * briefly; a member's own comments, votes, and reports come from uncached
 * requests, and the page adds what they post without asking again.
 * Cloudflare keeps none: its edge outside the US would then hold members'
 * names and comments, which are stored in the US only (ADR 0014).
 */
export const COMMENT_LIST_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
  "Cloudflare-CDN-Cache-Control": "no-store",
};
/** Refused or unknown lists: shared caches may keep the answer a minute. */
export const COMMENT_LIST_REFUSED = { "Cache-Control": "public, max-age=60" };

/** The answer for a failed comment request: refusals as they are, the rest as 503. */
export function commentFailure(error: unknown, action: string): Response {
  if (error instanceof CommentRefusal) {
    return apiError(error.status, error.message, { code: error.code });
  }
  if (error instanceof InvalidCommentCursorError) {
    return apiError(400, error.message);
  }
  console.error(
    `Comment request failed (${action}):`,
    error instanceof Error ? error.message : error,
  );
  return apiError(
    503,
    "Comments are not available right now. Try again in a moment.",
  );
}
