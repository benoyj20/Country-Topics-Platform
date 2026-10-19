"use client";

import Link from "next/link";

import { authClient } from "@/auth/client";
import { NavLink } from "@/components/NavLink";

/**
 * "Sign in" or "Your account", from the session the browser asks for after
 * the page loads: public pages are cached for everyone, so personal data
 * stays out of them (AGENTS.md). Asking also refreshes an active session, as
 * RefreshSession does in the admin panel.
 */
export function AccountLink() {
  const { data, isPending } = authClient.useSession();
  // Holds the link's place, so the header does not shift when it appears.
  if (isPending)
    return (
      <span className="nav-placeholder" aria-hidden="true">
        Your account
      </span>
    );
  return data ? (
    <NavLink href="/account">Your account</NavLink>
  ) : (
    <Link href="/sign-in" className="nav-cta">
      Sign in
    </Link>
  );
}
