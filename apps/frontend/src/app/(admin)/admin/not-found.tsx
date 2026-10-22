import Link from "next/link";

import { AdminShell } from "@/admin/components/AdminShell";

/** A collection or record the admin does not have. */
export default function AdminNotFound() {
  return (
    <AdminShell>
      <section className="admin-card narrow">
        <h1>Not found</h1>
        <p>There is nothing at this address, or you may not see it.</p>
        <p>
          <Link href="/admin">Go to the admin&apos;s start</Link>
        </p>
      </section>
    </AdminShell>
  );
}
