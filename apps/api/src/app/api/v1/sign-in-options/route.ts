import type { SignInOptions } from "@countrytopics/contracts";

import { NO_STORE } from "@/api/json";
import { serverEnv } from "@/env";

// GET /api/v1/sign-in-options: what the sign-in page offers (ADR 0014).
// The frontend renders the page; the backend holds the settings, so the
// Turnstile site key always matches the secret it checks tokens with.

export const dynamic = "force-dynamic";

export function GET() {
  const env = serverEnv();
  const options: SignInOptions = {
    google: Boolean(env.google),
    turnstileSiteKey: env.turnstile?.siteKey ?? null,
  };
  return Response.json(options, { headers: NO_STORE });
}
