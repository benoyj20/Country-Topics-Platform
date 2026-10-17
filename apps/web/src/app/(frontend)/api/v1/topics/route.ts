import { InvalidCursorError } from "@countrytopics/search/topic-search";

import { browseTopics } from "@/public/browse";
import { browseSearchParams, parseBrowseQuery } from "@/public/browse-query";

// GET /api/v1/topics: listed topics for browsing and search (ADR 0008), with
// the same parameters as the /topics page, plus `cursor` for later pages.
// The response is public and the same for everyone. Shared caches may keep
// it for a minute: the worker updates the search index, and it cannot reach
// Next.js's cache to purge it, so the response is not kept there.
//
// Only canonical requests are answered, so equal requests share one cache
// entry: other parameters are refused, and the same request written another
// way (order, repeats, defaults) is redirected to its canonical address.
// Rate limits come with week 10.

export const dynamic = "force-dynamic";

const CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const NO_STORE = { "Cache-Control": "no-store" };
const REFUSED = { "Cache-Control": "public, max-age=60" };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const cursors = params.getAll("cursor");
  params.delete("cursor");
  const { query, problems, unknown } = parseBrowseQuery(params);
  if (cursors.length > 1) problems.push('"cursor" was given more than once.');
  for (const key of unknown) problems.push(`"${key}" is not a parameter.`);
  if (problems.length > 0) {
    return Response.json(
      { error: "The request has values that are not valid.", problems },
      { status: 400, headers: REFUSED },
    );
  }
  const cursor = cursors[0] || null;
  const canonical = browseSearchParams(query);
  if (cursor) canonical.set("cursor", cursor);
  if (cursor) params.set("cursor", cursor);
  if (canonical.toString() !== params.toString()) {
    url.search = canonical.toString();
    return Response.redirect(url, 308);
  }
  try {
    const result = await browseTopics(query, cursor);
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
