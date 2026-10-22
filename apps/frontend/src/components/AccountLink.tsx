"use client";

import Link from "next/link";

import { authClient } from "@/auth/client";
import { NavLink } from "@/components/NavLink";

/**
 * "Sign in" or "Your account", from the session the browser asks for after
 * the page loads: public pages are cached for everyone, so personal data
 * stays out of them (AGENTS.md). Asking also refreshes an active session,
 * which the pages rendered for a member never do (backend/account.ts).
 */
export function AccountLink() {
  const { data, isPending } = authClient.useSession();
  // Holds the link's place, so the header does not shift when it appears.
  if (isPending)
    return (
      <span className="nav-placeholder" aria-hidden="true">
        <span className="nav-long">Your </span>account
      </span>
    );
  return data ? (
    <NavLink href="/account">
      <span className="nav-long">Your </span>account
    </NavLink>
  ) : (
    <Link href="/sign-in" className="nav-cta">
      Sign in
    </Link>
  );
}
