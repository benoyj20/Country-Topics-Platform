import {
  isClientAddress,
  LOCAL_CLIENT_ADDRESS,
} from "@countrytopics/forwarding";

import type { FrontendSettings } from "./settings.ts";

/**
 * The visitor's address, which every request to the backend is signed
 * with: Cloudflare's header when deployed; locally, where no Cloudflare
 * header exists, 127.0.0.1 for everyone, so local requests share one
 * bucket. Null when a deployed request has none.
 */
export function visitorAddress(
  headers: Headers,
  settings: Pick<FrontendSettings, "environment">,
): string | null {
  if (settings.environment === "local") return LOCAL_CLIENT_ADDRESS;
  const address = headers.get("cf-connecting-ip")?.trim() ?? "";
  return isClientAddress(address) ? address : null;
}
