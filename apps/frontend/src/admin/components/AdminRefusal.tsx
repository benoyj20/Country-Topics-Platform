import type { Account } from "@countrytopics/contracts";
import Link from "next/link";

import type { AdminRefusal as Refusal } from "../gate";
import { AdminShell } from "./AdminShell";
import { AdminVerification } from "./AdminVerification";

/** What the gate shows someone signed in who may not open the admin yet. */
export function AdminRefusal({
  refusal,
  account,
}: {
  refusal: Refusal;
  account: Account;
}) {
  return (
    <AdminShell>
      {refusal === "not-staff" ? (
        <section className="admin-card narrow">
          <h1>This area is for the site&apos;s staff</h1>
          <p>Your account is a member account.</p>
          <p>
            <Link href="/">Go to the home page</Link>
          </p>
        </section>
      ) : (
        <AdminVerification twoFactorEnabled={account.twoFactorEnabled} />
      )}
    </AdminShell>
  );
}
