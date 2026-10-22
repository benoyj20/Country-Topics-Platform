import Link from "next/link";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate } from "@/admin/gate";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path: string[] }> };

/**
 * Any other address under /admin, such as an old link to one of Payload's
 * panel's own pages, which phase 12 of ADR 0014 removed: it passes the
 * gate, then says there is nothing here.
 */
export default async function OtherAdminPage({ params }: Props) {
  const { path } = await params;
  const here = `/admin/${path.map(encodeURIComponent).join("/")}`;
  const gate = await adminGate(here);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  return (
    <AdminShell account={gate.account}>
      <section className="admin-card narrow">
        <h1>No such page</h1>
        <p>
          Nothing in the admin is at this address. Every collection is listed in
          the menu, and on the <Link href="/admin">dashboard</Link>.
        </p>
      </section>
    </AdminShell>
  );
}
