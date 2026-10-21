import type { ReactNode } from "react";

import { type adminAccess, backendOrigin } from "./payload";

// What the admin shows instead of a page when it cannot show one.

/** Shown to anyone who may not open the admin. */
function SignInNeeded() {
  const origin = backendOrigin();
  return (
    <section>
      <h1>Sign in as staff</h1>
      <p>
        The admin needs a staff account that has passed the authenticator check.
        Until phase 4 passes sign-in through this site, do both on the backend:
        sign in at <a href={`${origin}/sign-in`}>{origin}/sign-in</a>, then pass
        the check at <a href={`${origin}/admin`}>{origin}/admin</a>, and come
        back. Browsers send that sign-in here too, as cookies are not tied to a
        port.
      </p>
    </section>
  );
}

/** Shown when the backend did not answer, or not as expected. */
export function BackendProblem({ unreachable }: { unreachable: boolean }) {
  return (
    <section>
      <h1>
        The backend {unreachable ? "did not answer" : "answered unexpectedly"}
      </h1>
      <p>
        The admin reads everything from apps/web at {backendOrigin()}. Check
        that it is running (<code>make dev</code>) and up to date, then reload
        this page.
      </p>
    </section>
  );
}

/** The notice to show instead of an admin page, or null to show the page. */
export function accessNotice(
  access: Awaited<ReturnType<typeof adminAccess>>,
): ReactNode | null {
  if (access === "staff") return null;
  if (access === "not-staff") return <SignInNeeded />;
  return <BackendProblem unreachable={access === "unreachable"} />;
}
