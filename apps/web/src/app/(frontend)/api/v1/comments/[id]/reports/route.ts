import { commentReportProblem } from "@countrytopics/domain";

import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { rateLimited, writingMember } from "@/api/member";
import {
  commentIdSchema,
  problemsOf,
  reportSchema,
  SMALL_REQUEST_MAX_BYTES,
} from "@/comments/requests";
import { commentFailure } from "@/comments/responses";
import { reportComment } from "@/comments/store";
import { writePool } from "@/write-pool";

// POST /api/v1/comments/[id]/reports, `{ reason, note? }`: a signed-in
// member reports someone else's comment to the moderators. 201 for a new
// report; 200 when they had already reported it, which changes nothing
// (ADR 0009). Reports are rate-limited (ADR 0010).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = reportSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The report could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  const { reason } = parsed.data;
  const note = parsed.data.note?.trim() ?? "";
  const problem = commentReportProblem(reason, note);
  if (problem) return apiError(400, problem);
  if (!commentIdSchema.safeParse(id).success) {
    return apiError(404, "That comment does not exist or is not public.");
  }
  const limited = await rateLimited("report", member.profile.id);
  if (limited) return limited;
  try {
    const created = await reportComment(await writePool(), {
      reporterId: member.profile.id,
      commentId: id,
      reason,
      note,
    });
    return Response.json(
      { reported: true },
      { status: created ? 201 : 200, headers: NO_STORE },
    );
  } catch (error) {
    return commentFailure(error, "report");
  }
}
