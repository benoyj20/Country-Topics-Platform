import {
  displayNameProblem,
  normalizeDisplayName,
} from "@countrytopics/domain";

import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { writingMember } from "@/api/member";
import {
  displayNameSchema,
  problemsOf,
  SMALL_REQUEST_MAX_BYTES,
} from "@/comments/requests";
import { loadPayload } from "@/payload-instance";

// PUT /api/v1/account/display-name, `{ displayName }`: the name shown
// publicly with the signed-in member's comments (ADR 0009). The change is
// in the audit log, like other profile changes.

export async function PUT(request: Request) {
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = displayNameSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The name could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  const displayName = normalizeDisplayName(parsed.data.displayName);
  const problem = displayNameProblem(displayName);
  if (problem) return apiError(400, problem);
  try {
    const payload = await loadPayload();
    await payload.update({
      collection: "users",
      id: member.profile.id,
      data: { displayName },
      // Members cannot edit their profile through Payload; this route
      // changes only this one field, and records them as the actor.
      overrideAccess: true,
      user: member.profile,
    });
    return Response.json({ displayName }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "Display name change failed:",
      error instanceof Error ? error.message : error,
    );
    return apiError(
      503,
      "Your name could not be saved right now. Try again in a moment.",
    );
  }
}
