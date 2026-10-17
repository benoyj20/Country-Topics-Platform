"use client";

import Link from "next/link";

import { authClient } from "@/auth/client";

/**
 * "Sign in" or "Your account", from the session the browser asks for after
 * the page loads: public pages are cached for everyone, so personal data
 * stays out of them (AGENTS.md). Asking also refreshes an active session, as
 * RefreshSession does in the admin panel.
 */
export function AccountLink() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return null;
  return data ? (
    <Link href="/account">Your account</Link>
  ) : (
    <Link href="/sign-in">Sign in</Link>
  );
}
