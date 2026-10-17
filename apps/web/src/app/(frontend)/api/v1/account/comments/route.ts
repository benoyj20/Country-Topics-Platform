import { apiError, NO_STORE } from "@/api/json";
import { requestProfile } from "@/api/member";
import { parseIds } from "@/comments/requests";
import { commentFailure } from "@/comments/responses";
import { commentViewer } from "@/comments/store";
import type { CommentViewer } from "@/comments/types";
import { writePool } from "@/write-pool";

// GET /api/v1/account/comments?ids=a,b,c: the signed-in person's part in
// the comments a page shows (their votes, reports, and own comments) and
// their display name. Personal, so never cached, and read from the primary
// so a vote just made is in it (ADR 0009). Visitors get an empty answer.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseIds(url.searchParams.get("ids"));
  if ("problem" in parsed) {
    return apiError(400, "The request has values that are not valid.", {
      problems: [parsed.problem],
    });
  }
  try {
    const profile = await requestProfile(request);
    const viewer: CommentViewer = profile
      ? {
          account: { displayName: profile.displayName ?? null },
          ...(await commentViewer(await writePool(), profile.id, parsed.ids)),
        }
      : { account: null, votes: {}, reported: [], mine: [] };
    return Response.json(viewer, { headers: NO_STORE });
  } catch (error) {
    return commentFailure(error, "viewer");
  }
}
