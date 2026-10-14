"use client";

import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), twoFactorClient()],
});

/** Confirms an authenticator code for this session (see auth/admin-verification.ts). */
export async function verifyAdminCode(
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch("/api/auth/admin-verification/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.ok) return { ok: true };
  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : "The code could not be checked. Try again.";
  return { ok: false, message };
}
