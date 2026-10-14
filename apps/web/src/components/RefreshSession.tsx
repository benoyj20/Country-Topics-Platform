"use client";

import { useEffect } from "react";

import { authClient } from "@/auth/client";

/**
 * Server-rendered pages read the session without refreshing it, because they
 * cannot set cookies. Asking Better Auth once per page load lets it extend an
 * active session and re-issue the cookie, so active people stay signed in.
 */
export function RefreshSession() {
  useEffect(() => {
    void authClient.getSession();
  }, []);
  return null;
}
