import { apiError, NO_STORE } from "@/api/json";
import { requestProfile } from "@/api/member";
import { parseListParams } from "@/comments/requests";
import { commentFailure } from "@/comments/responses";
import { listNotifications } from "@/notifications/store";
import { writePool } from "@/write-pool";

// GET /api/v1/account/notifications?cursor=: the signed-in member's
// notifications, newest first (ADR 0010). Personal, so never cached, and
// read from the primary so one just marked read shows as read.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { cursor, problems } = parseListParams(url.searchParams, {
    sorted: false,
  });
  if (problems.length > 0) {
    return apiError(400, "The request has values that are not valid.", {
      problems,
    });
  }
  try {
    const profile = await requestProfile(request);
    if (!profile) {
      return apiError(401, "Sign in to see your notifications.");
    }
    return Response.json(
      await listNotifications(await writePool(), profile.id, cursor),
      { headers: NO_STORE },
    );
  } catch (error) {
    return commentFailure(error, "notifications");
  }
}
