import type { AuthStrategy } from "payload";

import { serverEnv } from "@/env";

import { ensureUserProfile } from "./accounts";
import { getAuth } from "./auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery guard. The session cookie is sent with any
 * same-site request, so a write is trusted only when the browser says it came
 * from the site itself.
 */
function isSameOriginWrite(headers: Headers, siteUrl: string): boolean {
  const origin = headers.get("origin");
  if (origin) return origin === siteUrl;
  return headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Lets Payload (admin panel, REST, local API with a request) trust a Better Auth
 * session. The returned user carries this session's authenticator state, which
 * the access rules in src/access.ts check.
 */
export const betterAuthStrategy: AuthStrategy = {
  name: "better-auth",
  authenticate: async ({ headers, payload, req }) => {
    const method = req?.method?.toUpperCase();
    if (
      method &&
      !SAFE_METHODS.has(method) &&
      !isSameOriginWrite(headers, serverEnv().siteUrl)
    ) {
      return { user: null };
    }

    // Payload cannot set cookies here, so do not let Better Auth try to refresh;
    // the browser refreshes its session through /api/auth (RefreshSession).
    const session = await getAuth().api.getSession({
      headers,
      query: { disableRefresh: true },
    });
    if (!session) return { user: null };

    const profile = await ensureUserProfile(payload, session.user);
    if (!profile) return { user: null };

    const verifiedAt = session.session.twoFactorVerifiedAt;
    return {
      user: {
        ...profile,
        collection: "users",
        _strategy: "better-auth",
        twoFactorEnabled: session.user.twoFactorEnabled === true,
        twoFactorVerifiedAt: verifiedAt
          ? new Date(verifiedAt).toISOString()
          : null,
      },
    };
  },
};
