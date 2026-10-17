import { isSlug } from "@countrytopics/domain";

import { apiError } from "@/api/json";
import { commentIdSchema } from "@/comments/requests";
import {
  COMMENT_LIST_CACHE,
  COMMENT_LIST_REFUSED,
  commentFailure,
} from "@/comments/responses";
import { findCommentTopic, findThread } from "@/comments/store";
import { readPool } from "@/read-pool";

// GET /api/v1/topics/[slug]/comments/[id]: the thread holding one comment
// (the comment, or a reply's thread), as the topic's list shows threads.
// For links to a comment, such as from a notification, when its thread is
// not on the first page. Public and cached like the list; it takes no
// parameters, so it has one address (ADR 0010).

export const dynamic = "force-dynamic";

const NOT_LISTED = "That comment is not in this topic's discussion.";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const keys = [...new URL(request.url).searchParams.keys()];
  if (keys.length > 0) {
    return apiError(400, "The request has values that are not valid.", {
      problems: [...new Set(keys)].map((key) => `"${key}" is not a parameter.`),
      headers: COMMENT_LIST_REFUSED,
    });
  }
  try {
    const topic = isSlug(slug)
      ? await findCommentTopic(readPool(), slug)
      : null;
    const thread =
      topic && commentIdSchema.safeParse(id).success
        ? await findThread(readPool(), topic, id)
        : null;
    if (!topic || !thread) {
      return apiError(404, NOT_LISTED, { headers: COMMENT_LIST_REFUSED });
    }
    return Response.json(
      { open: topic.open, thread },
      { headers: COMMENT_LIST_CACHE },
    );
  } catch (error) {
    return commentFailure(error, "thread");
  }
}
