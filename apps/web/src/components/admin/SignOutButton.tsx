"use client";

import { SignOutButton as SiteSignOutButton } from "@/components/SignOutButton";

/** Replaces Payload's logout button, which would only clear Payload's own cookie. */
export function SignOutButton() {
  return (
    <SiteSignOutButton className="btn btn--style-secondary btn--size-small" />
  );
}
