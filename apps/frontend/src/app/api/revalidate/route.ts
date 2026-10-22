import { revalidateTag } from "next/cache";

import { purgeResponse } from "@/purges";
import { frontendSettings } from "@/settings";

// The worker's purge (purges.ts). Not passed on to the backend, which
// has a purge of its own. Next.js writes the purged tags after the answer,
// in the request's waitUntil; there is no way to wait for it here.

export const dynamic = "force-dynamic";

// As the backend purges: the next visitor gets a fresh render, never the
// stale page.
const EXPIRE_NOW = { expire: 0 };

export function POST(request: Request): Promise<Response> {
  return purgeResponse(request, frontendSettings().purgeKey, (tag) =>
    revalidateTag(tag, EXPIRE_NOW),
  );
}
