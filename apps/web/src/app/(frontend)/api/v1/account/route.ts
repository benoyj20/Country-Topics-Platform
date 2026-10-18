import { isRole, isStaff, normalizeEmail } from "@countrytopics/domain";
import * as z from "zod";

import { signedInRecently } from "@/account/recent-sign-in";
import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { writingMember } from "@/api/member";
import { problemsOf, SMALL_REQUEST_MAX_BYTES } from "@/comments/requests";
import { loadPayload } from "@/payload-instance";

// DELETE /api/v1/account, `{ email }`: the signed-in member deletes their
// own account (ADR 0011). They confirm by typing their email address and
// must have signed in within the last few minutes. Staff accounts are
// deleted by another admin, so a site is never left without one. What the
// deletion removes is in src/account/deletion.ts.

const EMAIL_MAX_LENGTH = 320;
const confirmationSchema = z
  .object({ email: z.string().max(EMAIL_MAX_LENGTH) })
  .strict();

export async function DELETE(request: Request) {
  const member = await writingMember(
    request,
    "Sign in to delete your account.",
  );
  if (!member.ok) return member.response;
  const { profile } = member;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = confirmationSchema.safeParse(read.value);
  if (!parsed.success) {
    return apiError(400, "The confirmation could not be read.", {
      problems: problemsOf(parsed.error),
    });
  }
  if (normalizeEmail(parsed.data.email) !== profile.email) {
    return apiError(400, "Type your email address exactly as shown.", {
      code: "confirm-email",
    });
  }
  if (isRole(profile.role) && isStaff(profile.role)) {
    return apiError(
      403,
      "Staff accounts are deleted by an admin. Ask another admin to delete yours.",
      { code: "staff-account" },
    );
  }
  if (!signedInRecently(member.sessionCreatedAt)) {
    return apiError(
      403,
      "For your safety, sign in again before deleting your account.",
      { code: "sign-in-again" },
    );
  }
  try {
    const payload = await loadPayload();
    await payload.delete({
      collection: "users",
      id: profile.id,
      // Members cannot delete profiles through Payload; this route deletes
      // only their own, and records that they did.
      overrideAccess: true,
      user: profile,
    });
    return Response.json({ deleted: true }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "Account deletion failed:",
      error instanceof Error ? error.message : error,
    );
    return apiError(
      503,
      "Your account could not be deleted right now. Try again in a moment.",
    );
  }
}
