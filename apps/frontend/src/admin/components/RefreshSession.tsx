"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/auth/client";

/**
 * Keeps a staff member's session alive while they work in the admin, as
 * Payload's panel did: every read the admin makes leaves the session as it
 * is (backend/account.ts), so it would end a fixed time after signing in,
 * however busy they were. Asking for the session from the browser, on each
 * admin page, refreshes it once it is old enough.
 */
export function RefreshSession() {
  const pathname = usePathname();
  useEffect(() => {
    // A failed refresh changes nothing: the next page asks again, and an
    // ended session is met by the admin's gate.
    authClient.getSession().catch(() => {});
  }, [pathname]);
  return null;
}
