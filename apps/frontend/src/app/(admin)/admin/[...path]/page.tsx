import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { PanelLink } from "@/admin/components/PanelLink";
import { adminGate } from "@/admin/gate";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path: string[] }> };

/**
 * Any other address under /admin, such as one of Payload's panel's own
 * pages: it passes the gate, then says where that work is done for now.
 */
export default async function OtherAdminPage({ params }: Props) {
  const { path } = await params;
  const here = `/admin/${path.map(encodeURIComponent).join("/")}`;
  const gate = await adminGate(here);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  return (
    <AdminShell account={gate.account}>
      <section className="admin-card narrow">
        <h1>Not built yet</h1>
        <p>This part of the admin comes in a later phase of ADR 0014.</p>
        <PanelLink path={here} />
      </section>
    </AdminShell>
  );
}
