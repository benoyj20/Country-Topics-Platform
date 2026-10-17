import { apiError, NO_STORE } from "@/api/json";
import { requestProfile } from "@/api/member";
import { commentFailure } from "@/comments/responses";
import { unreadNotifications } from "@/notifications/store";
import { writePool } from "@/write-pool";

// GET /api/v1/account/notifications/unread: how many of the signed-in
// member's notifications are unread, for the site header (ADR 0010).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requestProfile(request);
    if (!profile) {
      return apiError(401, "Sign in to see your notifications.");
    }
    return Response.json(
      { unread: await unreadNotifications(await writePool(), profile.id) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return commentFailure(error, "unread notifications");
  }
}
