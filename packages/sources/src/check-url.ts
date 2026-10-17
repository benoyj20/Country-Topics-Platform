import { lookup as dnsLookup } from "node:dns";
import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import type { IdentifierCheck } from "@countrytopics/domain";

import { isPublicAddress } from "./addresses.ts";

export const LINK_CHECK_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const STANDARD_PORTS = new Set(["", "80", "443"]);

export type LinkCheckOptions = {
  userAgent: string;
  timeoutMs?: number;
  /** Tests allow their local server here; everything else keeps the defaults. */
  isAllowedAddress?: (address: string) => boolean;
  isAllowedPort?: (port: string) => boolean;
};

export type LinkCheck = Omit<IdentifierCheck, "identifier">;

class BlockedAddressError extends Error {
  code = "EBLOCKEDADDRESS";
}

/**
 * Resolves the host and refuses to connect when any of its addresses is not
 * allowed. Checking every address, at connection time, stops a host from
 * pointing a public name at an internal address (DNS rebinding).
 */
function guardedLookup(
  isAllowed: (address: string) => boolean,
): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(
      hostname,
      { all: true, family: options.family },
      (error, addresses) => {
        if (error) {
          callback(error, "", 0);
          return;
        }
        const first = addresses[0];
        if (!first || addresses.some(({ address }) => !isAllowed(address))) {
          callback(new BlockedAddressError(hostname), "", 0);
          return;
        }
        if (options.all) callback(null, addresses);
        else callback(null, first.address, first.family);
      },
    );
  };
}

function requestStatus(
  url: URL,
  options: Required<LinkCheckOptions>,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    // GET rather than HEAD: many servers answer HEAD wrongly. The body is
    // never read; the connection closes once the status arrives.
    const outgoing = request(url, {
      method: "GET",
      headers: { "User-Agent": options.userAgent, Accept: "*/*" },
      lookup: guardedLookup(options.isAllowedAddress),
      signal,
    });
    outgoing.on("response", (response) => {
      response.destroy();
      resolve(response);
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

const NOT_PUBLIC: LinkCheck = {
  outcome: "not_found",
  message: "The link points to a private or local network address.",
};

/**
 * Whether a web page exists, without trusting the link: only http(s) on the
 * standard ports, only public addresses (including after redirects), a few
 * redirects at most, and a time limit.
 */
export async function checkUrl(
  input: string,
  options: LinkCheckOptions,
): Promise<LinkCheck> {
  const settings: Required<LinkCheckOptions> = {
    timeoutMs: LINK_CHECK_TIMEOUT_MS,
    isAllowedAddress: isPublicAddress,
    isAllowedPort: (port) => STANDARD_PORTS.has(port),
    ...options,
  };
  const signal = AbortSignal.timeout(settings.timeoutMs);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { outcome: "not_found", message: "The link is not a valid URL." };
  }

  for (let redirects = 0; ; redirects += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return {
        outcome: "not_found",
        message: "Only http and https links can be checked.",
      };
    }
    if (!settings.isAllowedPort(url.port) || url.username || url.password) {
      return {
        outcome: "not_found",
        message: "The link uses an unusual port or contains a password.",
      };
    }
    // Node connects to IP literals without a lookup, so check them here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !settings.isAllowedAddress(host)) return NOT_PUBLIC;

    let response: IncomingMessage;
    try {
      response = await requestStatus(url, settings, signal);
    } catch (error) {
      const code = errorCode(error);
      if (code === "EBLOCKEDADDRESS") return NOT_PUBLIC;
      if (code === "ENOTFOUND") {
        return {
          outcome: "not_found",
          message: "The site's domain does not exist.",
        };
      }
      if (signal.aborted) {
        return {
          outcome: "failed",
          message: "The site did not answer in time.",
        };
      }
      return {
        outcome: "failed",
        message: `The site could not be reached${code ? ` (${code})` : ""}.`,
      };
    }

    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location) {
      if (redirects >= MAX_REDIRECTS) {
        return {
          outcome: "failed",
          message: "The link redirects too many times.",
        };
      }
      try {
        url = new URL(location, url);
      } catch {
        return {
          outcome: "not_found",
          message: "The site redirects to an invalid address.",
        };
      }
      continue;
    }
    if (status >= 200 && status < 300) {
      return { outcome: "resolved", message: `The page answered (${status}).` };
    }
    // Many sites refuse automated requests; the page still exists.
    if (status === 401 || status === 403) {
      return {
        outcome: "resolved",
        message: `The site answered but refuses automated access (${status}); check the page by hand.`,
      };
    }
    if (status === 429 || status >= 500) {
      return {
        outcome: "failed",
        message: `The site answered with a temporary error (${status}).`,
      };
    }
    return {
      outcome: "not_found",
      message: `The page was not found (${status}).`,
    };
  }
}
