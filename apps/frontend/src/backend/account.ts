import "server-only";

import {
  type Account,
  AccountAnswer,
  SignInOptions,
} from "@countrytopics/contracts";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";

import { BackendError, FRONTEND_ADDRESS, readBackend } from "./request";
import { visitorRead } from "./visitor";

// The visitor's account, for the pages rendered for them: the member pages
// and the admin's gate (ADR 0014). The backend reads the session from the
// visitor's cookie; reading it never sets one, and the browser refreshes
// its session through /api/auth (AccountLink). Never cached; the sign-in
// options, the same for everyone, for a few minutes.

/** The signed-in person, or null for visitors. One read per request. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  // No cookie, no session: nothing to ask, nor any address needed.
  if (!(await headers()).get("cookie")) return null;
  const answer = await readBackend(
    "/api/v1/account",
    AccountAnswer,
    await visitorRead(),
  );
  if (!answer) throw new BackendError("/api/v1/account", 404);
  return answer.account;
});

/** The sign-in options change only with the backend's settings. */
const SIGN_IN_OPTIONS_LIFETIME_S = 300;

/** What the sign-in page offers: Google, and Turnstile's site key. */
export const signInOptions = unstable_cache(
  async (): Promise<SignInOptions> => {
    const options = await readBackend(
      "/api/v1/sign-in-options",
      SignInOptions,
      { clientAddress: FRONTEND_ADDRESS },
    );
    if (!options) throw new BackendError("/api/v1/sign-in-options", 404);
    return options;
  },
  ["sign-in-options"],
  { revalidate: SIGN_IN_OPTIONS_LIFETIME_S },
);
