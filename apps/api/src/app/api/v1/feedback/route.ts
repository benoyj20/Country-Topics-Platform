import { NewFeedback } from "@countrytopics/contracts";
import {
  feedbackMessageProblem,
  feedbackPagePath,
  normalizeFeedbackMessage,
} from "@countrytopics/domain";

import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { rateLimited, refundRateLimited, writingMember } from "@/api/member";
import { problemsOf } from "@/comments/requests";
import { FEEDBACK_REQUEST_MAX_BYTES } from "@/feedback/requests";
import { loadPayload } from "@/payload-instance";

// POST /api/v1/feedback, `{ kind, message, page? }`: a member's feedback
// about the site, for staff to read in the admin panel (ADR 0011). `page`
// is the path it was sent from; anything else there is dropped.

export async function POST(request: Request) {
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, FEEDBACK_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = NewFeedback.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The feedback could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  const message = normalizeFeedbackMessage(parsed.data.message);
  const problem = feedbackMessageProblem(message);
  if (problem) return apiError(400, problem);
  const limited = await rateLimited("feedback", member.profile.id);
  if (limited) return limited;
  try {
    const payload = await loadPayload();
    await payload.create({
      collection: "feedback",
      data: {
        author: member.profile.id,
        kind: parsed.data.kind,
        message,
        page: parsed.data.page ? feedbackPagePath(parsed.data.page) : null,
        status: "new",
      },
      // Members cannot write to Payload; this route sets every field.
      overrideAccess: true,
      user: member.profile,
    });
    return Response.json({ sent: true }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error(
      "Feedback could not be saved:",
      error instanceof Error ? error.message : error,
    );
    await refundRateLimited("feedback", member.profile.id);
    return apiError(
      503,
      "Your feedback could not be sent right now. Try again in a moment.",
    );
  }
}
