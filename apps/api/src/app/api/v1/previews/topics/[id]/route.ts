import { isRecordId } from "@countrytopics/contracts";

import { apiError, NO_STORE } from "@/api/json";
import { accountFor } from "@/auth/current-account";
import { loadTopicPreview } from "@/public/topic-page";

// GET /api/v1/previews/topics/:id: the topic page's data from its newest
// draft (ADR 0014, live preview), for verified staff only, as Payload's
// access rules let them read drafts. It is never cached: each preview
// shows the draft as it is now.

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const account = await accountFor(request.headers);
    if (!account) return apiError(401, "Sign in to preview drafts.");
    if (!account.staff || !account.adminVerified) {
      return apiError(
        403,
        "Only staff who passed the admin's check preview drafts.",
      );
    }
    const page = isRecordId(id) ? await loadTopicPreview(id) : null;
    if (!page) return apiError(404, "There is no topic with this id.");
    return Response.json(page, { headers: NO_STORE });
  } catch (error) {
    // The error itself, so the report keeps its stack.
    console.error("Topic preview failed:", error);
    return apiError(
      503,
      "The preview is not available right now. Try again in a moment.",
    );
  }
}
