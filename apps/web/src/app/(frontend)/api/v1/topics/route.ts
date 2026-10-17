import { InvalidCursorError } from "@countrytopics/search/topic-search";

import { browseTopics } from "@/public/browse";
import { parseBrowseQuery } from "@/public/browse-query";

// GET /api/v1/topics: listed topics for browsing and search (ADR 0008), with
// the same parameters as the /topics page, plus `cursor` for later pages.
// The response is public and the same for everyone. Shared caches may keep
// it for a minute: the worker updates the search index, and it cannot reach
// Next.js's cache to purge it, so the response is not kept there.

export const dynamic = "force-dynamic";

const CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const { query, problems } = parseBrowseQuery(params);
  if (problems.length > 0) {
    return Response.json(
      { error: "The request has values that are not valid.", problems },
      { status: 400, headers: { "Cache-Control": `public, max-age=60` } },
    );
  }
  try {
    const result = await browseTopics(query, params.get("cursor") || null);
    return Response.json(result, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return Response.json(
        { error: error.message, problems: [] },
        { status: 400, headers: NO_STORE },
      );
    }
    console.error(
      "Topic search failed:",
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      {
        error: "Search is not available right now. Try again in a moment.",
        problems: [],
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
