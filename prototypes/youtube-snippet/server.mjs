// Tiny dependency-free dev server for the snippet prototype.
// Serves the static page (YouTube embeds refuse file:// pages, which send no referrer) and exposes
// /api/video, which checks a video via oEmbed and, when YOUTUBE_API_KEY is set, the Data API.
// Doing the lookup server-side avoids CORS and keeps the API key out of the browser.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_TIMEOUT_MS = 5000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/video")
      return sendJson(res, 200, await lookupVideo(url.searchParams.get("id")));
    await serveStatic(url.pathname, res);
  } catch (err) {
    if (err.status) return sendJson(res, err.status, { error: err.message });
    // Unexpected failures (network errors, timeouts) are logged here; the browser gets a generic message.
    console.error(`${req.method} ${url.pathname} failed:`, err);
    sendJson(res, 502, {
      error: "YouTube lookup failed. Check your connection and try again.",
    });
  }
}).listen(PORT, "localhost", () => {
  console.log(`YouTube snippet prototype → http://localhost:${PORT}`);
  console.log(
    API_KEY
      ? "YouTube Data API: enabled"
      : "YouTube Data API: off (set YOUTUBE_API_KEY for duration/embeddable checks)",
  );
});

async function lookupVideo(id) {
  if (!/^[\w-]{11}$/.test(id ?? "")) throw httpError(400, "Invalid video id");
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const oembed = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
    {
      signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
    },
  );
  // oEmbed typically answers 401/403 when the uploader disabled embedding, 400/404 when private or removed.
  if (oembed.status === 401 || oembed.status === 403)
    return { id, ok: false, reason: "Embedding is disabled for this video." };
  if (!oembed.ok)
    return { id, ok: false, reason: "Video not found, private, or removed." };
  const meta = await oembed.json();
  const video = {
    id,
    ok: true,
    title: meta.title,
    channel: meta.author_name,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    source: "oembed",
  };
  if (API_KEY) Object.assign(video, await dataApiDetails(id));
  return video;
}

// videos.list with contentDetails + status costs 1 quota unit (of 10,000/day by default).
async function dataApiDetails(id) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${id}&key=${encodeURIComponent(API_KEY)}`,
    { signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS) },
  );
  if (!res.ok) return { dataApiError: `Data API returned ${res.status}` };
  const item = (await res.json()).items?.[0];
  if (!item)
    return { ok: false, reason: "Video not found, private, or removed." };
  return {
    duration: isoDurationToSeconds(item.contentDetails.duration),
    embeddable: item.status.embeddable,
    privacy: item.status.privacyStatus,
    ageRestricted:
      item.contentDetails.contentRating?.ytRating === "ytAgeRestricted",
    source: "oembed + data api",
    ...(item.status.embeddable
      ? {}
      : { ok: false, reason: "Embedding is disabled for this video." }),
  };
}

function isoDurationToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return null;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((v) =>
    v === undefined ? 0 : Number(v),
  );
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function serveStatic(pathname, res) {
  const rel = normalize(
    decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
  ).replace(/^[/\\]+/, "");
  const file = join(ROOT, rel);
  const type = TYPES[extname(file)];
  if (!file.startsWith(ROOT) || !type) throw httpError(404, "Not found");
  let body;
  try {
    body = await readFile(file);
  } catch {
    throw httpError(404, "Not found");
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  res.end(body);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
