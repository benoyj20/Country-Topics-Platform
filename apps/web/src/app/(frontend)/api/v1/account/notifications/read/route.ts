import * as z from "zod";

import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { writingMember } from "@/api/member";
import { problemsOf, SMALL_REQUEST_MAX_BYTES } from "@/comments/requests";
import { commentFailure } from "@/comments/responses";
import { MARK_READ_MAX } from "@/notifications/limits";
import { markNotificationsRead } from "@/notifications/store";
import { writePool } from "@/write-pool";

// POST /api/v1/account/notifications/read, `{ ids }`: marks the signed-in
// member's notifications as read; ids that are not theirs change nothing
// (ADR 0010).

const markReadSchema = z
  .object({ ids: z.array(z.uuid()).max(MARK_READ_MAX) })
  .strict();

export async function POST(request: Request) {
  const member = await writingMember(request);
  if (!member.ok) return member.response;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = markReadSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The request could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  try {
    const marked = await markNotificationsRead(
      await writePool(),
      member.profile.id,
      [...new Set(parsed.data.ids)],
    );
    return Response.json({ marked }, { headers: NO_STORE });
  } catch (error) {
    return commentFailure(error, "mark notifications read");
  }
}
