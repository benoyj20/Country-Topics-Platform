import { revalidateTag } from "next/cache";

import { spikeEnv, topicTag } from "../../backend";

// The purge the worker will send (ADR 0014). The real one is signed with an
// HMAC and a timestamp; the spike checks a shared value only.
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("x-purge-key") !== spikeEnv().PURGE_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response("bad slug", { status: 400 });
  }
  // As apps/web purges: the next request renders fresh data, never stale.
  revalidateTag(topicTag(slug), { expire: 0 });
  return Response.json({ purged: topicTag(slug) });
}
