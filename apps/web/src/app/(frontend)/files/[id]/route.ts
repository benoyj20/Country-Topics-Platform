import { createLocalReq } from "payload";

import { loadPayload } from "@/payload-instance";
import { publicFile } from "@/public/cached";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Browsers and shared caches may keep a file for an hour. A file that stops
// being public (taken out of a topic's live version) can stay in caches that
// long; files are never deleted while anything uses them.
const PUBLIC_FILE_CACHE = "public, max-age=3600";
// A file that is not public yet may become so when a topic is published.
const NOT_FOUND_CACHE = "public, max-age=60";
// Payload's policy for uploads (nothing in them may run scripts or frame
// other pages), plus the site-wide rule that only the site may frame it.
const FILE_CONTENT_SECURITY_POLICY =
  "script-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": NOT_FOUND_CACHE,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/** `inline; filename="…"` that survives any characters in the name. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * GET /files/[id]: an evidence file or photo that a public page shows. Every
 * other upload stays staff-only, served by Payload; this route answers 404
 * for those, as for files that do not exist.
 *
 * The file is read by the storage plugin's own handler, as Payload's file
 * route does once access is checked, so the storage key, ranges, and
 * revalidation (304) work the same; only the visibility check and the cache
 * headers are this route's.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return notFound();
  const found = await publicFile(id);
  if (!found?.stored.filename) return notFound();

  const payload = await loadPayload();
  const req = await createLocalReq(
    { req: { headers: request.headers, signal: request.signal } },
    payload,
  );
  const handlers = payload.collections.media.config.upload.handlers ?? [];
  let stored: Response | null = null;
  for (const handler of handlers) {
    const result = await handler(req, {
      doc: found.stored,
      headers: new Headers(),
      params: { collection: "media", filename: found.stored.filename },
    });
    if (result instanceof Response) {
      stored = result;
      break;
    }
  }
  if (!stored || stored.status === 404) {
    await stored?.body?.cancel();
    return notFound();
  }
  if (stored.status >= 400 && stored.status !== 416) return stored;

  const headers = new Headers(stored.headers);
  // The type checked on upload, not one the storage may have recorded.
  headers.set("Content-Type", found.file.mimeType);
  headers.set("Content-Disposition", contentDisposition(found.file.filename));
  // Replaces the staff-only `private, no-store` the collection sets.
  headers.set("Cache-Control", PUBLIC_FILE_CACHE);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", FILE_CONTENT_SECURITY_POLICY);
  return new Response(stored.body, { status: stored.status, headers });
}
