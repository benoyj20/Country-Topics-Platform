import { redirect } from "next/navigation";

import { NOT_INVITED_ERROR } from "@/auth/auth";
import { currentAccount } from "@/auth/current-account";
import { serverEnv } from "@/env";

import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in - Country Topics" };

const ERROR_MESSAGES: Record<string, string> = {
  [NOT_INVITED_ERROR]:
    "This site is invite-only during the pilot, and that address has not been invited.",
  INVALID_TOKEN:
    "That sign-in link has expired or was already used. Ask for a new one.",
  EXPIRED_TOKEN: "That sign-in link has expired. Ask for a new one.",
};
const GENERIC_ERROR = "Sign-in did not work. Please try again.";

/** Only same-site paths, so a crafted link cannot send people elsewhere. */
function safeCallback(value: string | string[] | undefined): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/account";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (await currentAccount()) redirect(safeCallback(params.callbackURL));

  const error =
    typeof params.error === "string"
      ? (ERROR_MESSAGES[params.error] ?? GENERIC_ERROR)
      : null;

  return (
    <section className="stack">
      <h1>Sign in</h1>
      <p className="muted">
        Country Topics is invite-only during the pilot. Use the Google account
        or email address you were invited with.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <SignInForm
        googleEnabled={Boolean(serverEnv().google)}
        callbackURL={safeCallback(params.callbackURL)}
      />
    </section>
  );
}
