import type { ReactNode } from "react";

import { frontendSettings } from "@/settings";

// Pieces of the draft privacy policy and terms (ADR 0011). Who runs the
// site and how to reach them come from SITE_OPERATOR and CONTACT_EMAIL;
// what is not decided yet is marked on the page, never made up.

/** Something the developer must decide, or have reviewed, before the pilot. */
export function ToDecide({ children }: { children: ReactNode }) {
  return <span className="to-decide">To be decided: {children}</span>;
}

export function DraftNotice() {
  return (
    <p className="notice" role="note">
      This is a draft for the invite-only pilot and has not been reviewed by a
      lawyer. Parts marked &ldquo;To be decided&rdquo; are completed before
      testers are invited.
    </p>
  );
}

/** Who runs the site, as SITE_OPERATOR names them. */
export function Operator() {
  const operator = frontendSettings().siteOperator;
  return operator ? (
    <strong>{operator}</strong>
  ) : (
    <ToDecide>who runs the site (SITE_OPERATOR)</ToDecide>
  );
}

/** The address to write to, from CONTACT_EMAIL. */
export function Contact() {
  const email = frontendSettings().contactEmail;
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <ToDecide>a contact address (CONTACT_EMAIL)</ToDecide>
  );
}
