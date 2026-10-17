import {
  commentBodyProblem,
  commentLinkCount,
  commentLinkProblem,
  isRole,
  isSlug,
  isStaff,
  normalizeCommentBody,
} from "@countrytopics/domain";

import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { rateLimited, writingMember } from "@/api/member";
import {
  COMMENT_REQUEST_MAX_BYTES,
  newCommentSchema,
  parseListParams,
  problemsOf,
} from "@/comments/requests";
import {
  COMMENT_LIST_CACHE,
  COMMENT_LIST_REFUSED,
  commentFailure,
} from "@/comments/responses";
import { createComment, findCommentTopic, listThreads } from "@/comments/store";
import { requestSearchIndex } from "@/content-jobs";
import { loadPayload } from "@/payload-instance";
import { readPool } from "@/read-pool";
import { writePool } from "@/write-pool";

// A topic's comments (ADR 0009).
// GET: a page of threads, `?sort=top|new|old&cursor=`, public and the same
// for everyone. Only canonical requests are answered, as GET
// /api/v1/topics does: other parameters get 400, and another spelling of
// the same request a 308 to its one address.
// POST: a signed-in member's comment or reply, `{ body, parentId? }`,
// within the rate and link limits (ADR 0010).

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

const NO_TOPIC = "That topic does not exist or is not published.";

export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  const url = new URL(request.url);
  const { sort, cursor, problems, canonical } = parseListParams(
    url.searchParams,
    { sorted: true },
  );
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
    const topic = isSlug(slug)
      ? await findCommentTopic(readPool(), slug)
      : null;
    if (!topic) {
      return apiError(404, NO_TOPIC, { headers: COMMENT_LIST_REFUSED });
    }
    return Response.json(await listThreads(readPool(), topic, sort, cursor), {
      headers: COMMENT_LIST_CACHE,
    });
  } catch (error) {
    return commentFailure(error, "list");
  }
}

export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, COMMENT_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = newCommentSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The comment could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  const body = normalizeCommentBody(parsed.data.body);
  const problem = commentBodyProblem(body);
  if (problem) return apiError(400, problem);
  const { profile } = member;
  const linkProblem = commentLinkProblem({
    links: commentLinkCount(body),
    accountCreatedAt: new Date(profile.createdAt),
    staff: isRole(profile.role) && isStaff(profile.role),
  });
  if (linkProblem) {
    return apiError(403, linkProblem, { code: "link-limit" });
  }
  const limited = await rateLimited("comment", profile.id);
  if (limited) return limited;

  try {
    const pool = await writePool();
    const topic = isSlug(slug) ? await findCommentTopic(pool, slug) : null;
    if (!topic) return apiError(404, NO_TOPIC);
    const { comment, updatedAt } = await createComment(pool, {
      topic,
      authorId: profile.id,
      parentId: parsed.data.parentId ?? null,
      body,
    });
    // For "Most discussed": the topic's comment count changed.
    await requestSearchIndex((await loadPayload()).logger, [topic.id], {
      table: "comments",
      id: comment.id,
      updatedAt,
    });
    return Response.json({ comment }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return commentFailure(error, "post");
  }
}
