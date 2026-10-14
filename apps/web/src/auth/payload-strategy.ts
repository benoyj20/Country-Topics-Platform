import type { AuthStrategy } from "payload";

import { ensureUserProfile } from "./accounts";
import { getAuth } from "./auth";

/**
 * Lets Payload (admin panel, REST, local API with a request) trust a Better Auth
 * session. The returned user carries this session's authenticator state, which
 * the access rules in src/access.ts check.
 */
export const betterAuthStrategy: AuthStrategy = {
  name: "better-auth",
  authenticate: async ({ headers, payload }) => {
    // Payload cannot set cookies here, so do not let Better Auth try to refresh.
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
