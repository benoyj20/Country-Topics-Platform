import { isSlug } from "@countrytopics/domain";

import { DATA_CACHE_HEADER, reportCache } from "./cache-report";

// The public pages' data over HTTP, for the frontend on Workers (ADR 0014,
// "The backend: APIs only"). Each endpoint answers with exactly what its
// page renders from, through the same cached loaders, so Valkey absorbs
// repeated reads and the same purges refresh both.

/**
 * Not kept by shared caches: the frontend caches the data itself and purges
 * it by tag, and a cache between the two could not be purged.
 */
const HEADERS = { "Cache-Control": "no-store" };

/**
 * The JSON answer for one page's data: 404 with `missing` when `load` finds
 * nothing public, as the page would, and 503 when it fails. A found page
 * says whether its data came from the shared cache (cache-report.ts).
 */
export async function pageDataResponse<T>(
  load: () => Promise<T | null>,
  missing: string,
): Promise<Response> {
  let data: T | null;
  let cache: "HIT" | "MISS" | null;
  try {
    ({ value: data, cache } = await reportCache(load));
  } catch (error) {
    // The error itself, so the report keeps its stack.
    console.error("Page data failed:", error);
    return Response.json(
      {
        error:
          "This page's data is not available right now. Try again in a moment.",
      },
      { status: 503, headers: HEADERS },
    );
  }
  if (data === null) {
    return Response.json({ error: missing }, { status: 404, headers: HEADERS });
  }
  return Response.json(data, {
    headers: cache ? { ...HEADERS, [DATA_CACHE_HEADER]: cache } : HEADERS,
  });
}

type SlugContext = { params: Promise<{ slug: string }> };

/**
 * The GET handler for a page's data by slug. A malformed slug finds
 * nothing, as on the pages.
 */
export function slugPageData<T>(
  load: (slug: string) => Promise<T | null>,
  missing: string,
) {
  return async (_request: Request, { params }: SlugContext) => {
    const { slug } = await params;
    return pageDataResponse(
      () => (isSlug(slug) ? load(slug) : Promise.resolve(null)),
      missing,
    );
  };
}
