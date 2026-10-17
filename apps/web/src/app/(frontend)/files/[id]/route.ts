import { readStoredFile } from "@/file-storage";
import { publicFile } from "@/public/cached";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Browsers and shared caches may keep a file for an hour. A file that stops
// being public (taken out of a topic's live version) can stay in caches that
// long; files are never deleted while anything uses them.
const PUBLIC_FILE_CACHE = "public, max-age=3600";
// A file that is not public yet may become so when a topic is published.
const NOT_FOUND_CACHE = "public, max-age=60";

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
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return notFound();
  const found = await publicFile(id);
  if (!found) return notFound();

  const stored = await readStoredFile(found.objectKey, request.signal);
  if (!stored) return notFound();

  const headers = new Headers({
    // The type checked on upload, not one the storage may guess.
    "Content-Type": found.file.mimeType,
    "Content-Disposition": contentDisposition(found.file.filename),
    "Cache-Control": PUBLIC_FILE_CACHE,
    "X-Content-Type-Options": "nosniff",
    // Uploads are images and PDFs; nothing in them may run scripts or frame
    // other pages (Payload's policy for uploads), and like every page here
    // they may be framed only by the site itself (next.config.ts).
    "Content-Security-Policy":
      "script-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'self'",
  });
  if (stored.contentLength !== null) {
    headers.set("Content-Length", String(stored.contentLength));
  }
  if (stored.etag) headers.set("ETag", stored.etag);
  return new Response(stored.body, { status: 200, headers });
}
