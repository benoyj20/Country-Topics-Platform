import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { rateLimited, refundRateLimited, writingMember } from "@/api/member";
import {
  commentIdSchema,
  problemsOf,
  SMALL_REQUEST_MAX_BYTES,
  voteSchema,
} from "@/comments/requests";
import { commentFailure } from "@/comments/responses";
import { CommentRefusal, voteOnComment } from "@/comments/store";
import { writePool } from "@/write-pool";

// PUT /api/v1/comments/[id]/vote, `{ value: 1 | -1 | 0 }`: a signed-in
// member's vote on someone else's comment; 0 takes it back. Answers the
// comment's new score. Repeating a vote changes nothing (ADR 0009). Locked
// threads take no votes, and votes are rate-limited (ADR 0010).

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = voteSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The vote could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  if (!commentIdSchema.safeParse(id).success) {
    return apiError(404, "That comment does not exist or is not public.");
  }
  const limited = await rateLimited("vote", member.profile.id);
  if (limited) return limited;
  try {
    const result = await voteOnComment(await writePool(), {
      voterId: member.profile.id,
      commentId: id,
      value: parsed.data.value,
    });
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof CommentRefusal) {
      await refundRateLimited("vote", member.profile.id);
    }
    return commentFailure(error, "vote");
  }
}
