import { YOUTUBE_ID_PATTERN } from "@countrytopics/domain";

import { readLimited } from "./read-limited.ts";

// /thumbnails/:youtubeId (app/thumbnails): a video's thumbnail, fetched
// from YouTube's image server on the visitor's behalf (ADR 0014, "Video
// thumbnails come from the site"), so a topic page contacts no Google
// server before someone presses play. Only an 11-character video ID is accepted, and only
// that fixed address is fetched, with no cookies and none of the visitor's
// headers, so the route reaches nowhere else. Nothing is stored: browsers
// and Cloudflare's edge keep each image for a day, so a changed or removed
// thumbnail is gone within one.

/** The address YouTube's own oEmbed answers name for a video's thumbnail. */
export function thumbnailSource(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

const DAY_S = 86_400;
/** A missing video's answer is kept an hour, in case it is published. */
const MISSING_S = 3_600;
/** YouTube's thumbnails are tens of kilobytes; anything larger is refused. */
export const THUMBNAIL_MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;

function refusal(status: number, message: string, maxAgeS: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": `public, max-age=${maxAgeS}`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/** The answer for /thumbnails/`youtubeId`. */
export async function thumbnailResponse(
  youtubeId: string,
  send: typeof fetch = fetch,
): Promise<Response> {
  if (!YOUTUBE_ID_PATTERN.test(youtubeId)) {
    return refusal(404, "There is no thumbnail at this address.", DAY_S);
  }
  let upstream: Response;
  try {
    upstream = await send(thumbnailSource(youtubeId), {
      headers: { accept: "image/jpeg" },
      // A redirect is not followed: only the fixed address is fetched.
      // (Workers do not support "error".)
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Workers keep YouTube's answer at Cloudflare's edge as long as this
      // route's own: an image a day, a missing one an hour, an error not
      // at all. Node ignores this.
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: {
          "200-299": DAY_S,
          "404": MISSING_S,
          "300-399": 0,
          "400-403": 0,
          "405-599": 0,
        },
      },
    } as RequestInit);
  } catch (error) {
    console.error(
      "Thumbnail fetch failed:",
      error instanceof Error ? error.message : error,
    );
    return refusal(502, "The thumbnail could not be fetched.", 60);
  }
  if (upstream.status === 404) {
    await upstream.body?.cancel();
    return refusal(404, "This video has no thumbnail.", MISSING_S);
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    await upstream.body?.cancel();
    console.error(`Thumbnail fetch answered ${upstream.status} ${type}`);
    return refusal(502, "The thumbnail could not be fetched.", 60);
  }
  const body = await readLimited(upstream, THUMBNAIL_MAX_BYTES);
  if (!body) return refusal(502, "The thumbnail is too large.", 60);
  return new Response(body, {
    headers: {
      "Cache-Control": `public, max-age=${DAY_S}`,
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
