import "server-only";

import { headers } from "next/headers";

import { frontendSettings } from "@/settings";
import { visitorAddress } from "@/visitor-address";

/**
 * How to read from the backend for the visitor of this request: signed
 * with their address, with their cookies, as their own browser's requests
 * are passed on. Never for shared, cached data.
 */
export async function visitorRead(): Promise<{
  clientAddress: string;
  cookie: string | null;
}> {
  const incoming = await headers();
  const clientAddress = visitorAddress(incoming, frontendSettings());
  if (!clientAddress) {
    throw new Error("The request has no visitor address.");
  }
  return { clientAddress, cookie: incoming.get("cookie") };
}
