import { type AccountAnswer, AccountDeletion } from "@countrytopics/contracts";
import { isRole, isStaff, normalizeEmail } from "@countrytopics/domain";

import { signedInRecently } from "@/account/recent-sign-in";
import { apiError, NO_STORE, readJsonBody } from "@/api/json";
import { writingMember } from "@/api/member";
import { accountFor } from "@/auth/current-account";
import { problemsOf, SMALL_REQUEST_MAX_BYTES } from "@/comments/requests";
import { loadPayload } from "@/payload-instance";

// GET /api/v1/account: the signed-in person, `{ account }`, or
// `{ account: null }` for visitors (ADR 0014). The frontend asks before it
// renders a member page or the admin, sending the visitor's cookie.
// Personal, so never cached.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const account = await accountFor(request.headers);
    return Response.json({ account } satisfies AccountAnswer, {
      headers: NO_STORE,
    });
  } catch (error) {
    console.error(
      "Reading the account failed:",
      error instanceof Error ? error.message : error,
    );
    return apiError(
      503,
      "Your account could not be read right now. Try again in a moment.",
    );
  }
}

// DELETE /api/v1/account, `{ email }`: the signed-in member deletes their
// own account (ADR 0011). They confirm by typing their email address and
// must have signed in within the last few minutes. Staff accounts are
// deleted by another admin, so a site is never left without one. What the
// deletion removes is in src/account/deletion.ts.

export async function DELETE(request: Request) {
  const member = await writingMember(
    request,
    "Sign in to delete your account.",
  );
  if (!member.ok) return member.response;
  const { profile } = member;
  const read = await readJsonBody(request, SMALL_REQUEST_MAX_BYTES);
  if (!read.ok) return read.response;
  const parsed = AccountDeletion.safeParse(read.value);
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
