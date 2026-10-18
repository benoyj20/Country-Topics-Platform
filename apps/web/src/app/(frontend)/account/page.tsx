import { redirect } from "next/navigation";

import { RECENT_SIGN_IN_MS } from "@/account/deletion";
import { currentAccount } from "@/auth/current-account";
import { SignOutButton } from "@/components/SignOutButton";

import { DeleteAccountPanel } from "./DeleteAccountPanel";
import { DisplayNameForm } from "./DisplayNameForm";
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

      <DisplayNameForm current={account.displayName} />

      {account.staff && (
        <TwoFactorPanel
          twoFactorEnabled={account.twoFactorEnabled}
          adminVerified={account.adminVerified}
        />
      )}

      <div>
        <SignOutButton />
      </div>

      <section className="panel stack" aria-labelledby="your-data">
        <h2 id="your-data">Your data</h2>
        <p className="muted">
          A copy of what the site holds about you, as a JSON file: your account,
          sign-in sessions, comments, votes, reports, notifications, and
          feedback. See the <a href="/privacy">privacy policy</a>.
        </p>
        <div>
          {/* A download, not a page, so the router must not handle it. */}
          <a
            className="button secondary"
            href="/api/v1/account/export"
            download
          >
            Download your data
          </a>
        </div>
      </section>

      {account.staff ? (
        <p className="muted">
          Staff accounts are deleted by an admin. To leave, ask another admin to
          delete yours.
        </p>
      ) : (
        <DeleteAccountPanel
          email={account.email}
          recentSignInMinutes={RECENT_SIGN_IN_MS / 60_000}
        />
      )}
    </section>
  );
}
