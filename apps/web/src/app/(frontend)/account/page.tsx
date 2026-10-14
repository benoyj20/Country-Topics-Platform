import { redirect } from "next/navigation";

import { currentAccount } from "@/auth/current-account";
import { SignOutButton } from "@/components/SignOutButton";

import { TwoFactorPanel } from "./TwoFactorPanel";

export const metadata = { title: "Your account - Country Topics" };

export default async function AccountPage() {
  const account = await currentAccount();
  if (!account) redirect("/sign-in?callbackURL=%2Faccount");

  return (
    <section className="stack">
      <h1>Your account</h1>
      <dl className="details">
        <dt>Email</dt>
        <dd>{account.email}</dd>
        {account.name && (
          <>
            <dt>Name</dt>
            <dd>{account.name}</dd>
          </>
        )}
        <dt>Role</dt>
        <dd>{account.role}</dd>
      </dl>

      {account.staff && (
        <TwoFactorPanel
          twoFactorEnabled={account.twoFactorEnabled}
          adminVerified={account.adminVerified}
        />
      )}

      <div>
        <SignOutButton />
      </div>
    </section>
  );
}
