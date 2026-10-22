import Link from "next/link";

import { ADMIN_GROUPS, COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate, readableIn } from "@/admin/gate";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

/** The admin's start: every collection, grouped, as Payload's dashboard. */
export default async function AdminHome() {
  const gate = await adminGate("/admin");
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const { account } = gate;
  return (
    <AdminShell account={account}>
      <section className="admin-stack">
        <h1>Admin</h1>
        {ADMIN_GROUPS.map((group) => {
          const collections = readableIn(group, account);
          return (
            <section key={group} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`}>{group}</h2>
              <ul className="admin-cards">
                {collections.map((collection) => (
                  <li key={collection} className="admin-card">
                    <h3>
                      <Link href={`/admin/collections/${collection}`}>
                        {COLLECTION_TEXT[collection].plural}
                      </Link>
                    </h3>
                    {COLLECTION_TEXT[collection].description && (
                      <p className="admin-muted">
                        {COLLECTION_TEXT[collection].description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </section>
    </AdminShell>
  );
}
