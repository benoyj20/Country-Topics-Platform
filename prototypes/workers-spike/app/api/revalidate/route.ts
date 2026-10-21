import { revalidateTag } from "next/cache";

import { spikeEnv, TOPIC_PAGE_TAGS } from "../../backend";

// The purge the worker will send (ADR 0014). The real one is signed with an
// HMAC and a timestamp; the spike checks a shared value only.
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("x-purge-key") !== spikeEnv().PURGE_KEY) {
    return new Response("forbidden", { status: 403 });
  }
  const tag = new URL(request.url).searchParams.get("tag") ?? "";
  if (!(TOPIC_PAGE_TAGS as readonly string[]).includes(tag)) {
    return new Response("unknown tag", { status: 400 });
  }
  // As apps/web purges: the next request renders fresh data, never stale.
  revalidateTag(tag, { expire: 0 });
  return Response.json({ purged: tag });
}
