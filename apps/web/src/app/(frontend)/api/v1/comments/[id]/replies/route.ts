import { apiError } from "@/api/json";
import { commentIdSchema, parseListParams } from "@/comments/requests";
import {
  COMMENT_LIST_CACHE,
  COMMENT_LIST_REFUSED,
  commentFailure,
} from "@/comments/responses";
import { listReplies } from "@/comments/store";
import { readPool } from "@/read-pool";

// GET /api/v1/comments/[id]/replies?cursor=: more replies in a thread,
// oldest first, after the ones its topic's list showed (ADR 0009). Public,
// cached like the list, and answered only in canonical form.

export const dynamic = "force-dynamic";

const NO_THREAD = "That thread does not exist or is not public.";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const { cursor, problems, canonical } = parseListParams(url.searchParams, {
    sorted: false,
  });
  if (problems.length > 0) {
    return apiError(400, "The request has values that are not valid.", {
      problems,
      headers: COMMENT_LIST_REFUSED,
    });
  }
  if (canonical.toString() !== url.searchParams.toString()) {
    url.search = canonical.toString();
    return Response.redirect(url, 308);
  }
  try {
    const page = commentIdSchema.safeParse(id).success
      ? await listReplies(readPool(), id, cursor)
      : null;
    if (!page) {
      return apiError(404, NO_THREAD, { headers: COMMENT_LIST_REFUSED });
    }
    return Response.json(page, { headers: COMMENT_LIST_CACHE });
  } catch (error) {
    return commentFailure(error, "replies");
  }
}
