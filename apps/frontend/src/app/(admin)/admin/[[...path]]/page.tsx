import type { Metadata } from "next";
import Link from "next/link";

import { adminGate } from "@/admin/gate";
import { frontendSettings } from "@/settings";

export const metadata: Metadata = { title: "Admin - Country Topics" };

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path?: string[] }> };

/**
 * The admin, until phase 7 builds its screens (ADR 0014). Every address
 * under /admin passes the gate and then says where the work is done for
 * now: locally, the same page in Payload's panel on the backend.
 */
export default async function AdminPage({ params }: Props) {
  const { path = [] } = await params;
  const here = `/admin${path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : ""}`;
  const gate = await adminGate(here);
  if (!gate.ok) {
    return gate.refusal === "not-staff" ? (
      <section className="admin-card">
        <h1>This area is for the site&apos;s staff</h1>
        <p>Your account is a member account.</p>
        <p>
          <Link href="/">Go to the home page</Link>
        </p>
      </section>
    ) : (
      <section className="admin-card">
        <h1>Confirm your authenticator code</h1>
        <p>
          Staff confirm a code from their authenticator app before the admin
          opens, at least every 12 hours.
        </p>
        <p>
          <Link className="admin-button" href="/account">
            Confirm it on your account page
          </Link>
        </p>
      </section>
    );
  }
  const settings = frontendSettings();
  const panel =
    settings.environment === "local" ? `${settings.backendUrl}${here}` : null;
  return (
    <section className="admin-card">
      <h1>Admin</h1>
      <p>
        Signed in as {gate.account.email} ({gate.account.role}).
      </p>
      <p>
        The new admin is being built here (ADR 0014, phases 7 to 11). Until
        then, staff use Payload&apos;s panel
        {panel ? (
          <>
            {" "}
            on this machine: <a href={panel}>open this page there</a>.
          </>
        ) : (
          ", which runs on the developer's machine only."
        )}
      </p>
    </section>
  );
}
