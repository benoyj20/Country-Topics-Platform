import { redirect } from "next/navigation";

import { EMAIL_NOT_VERIFIED_ERROR, NOT_INVITED_ERROR } from "@/auth/auth";
import { currentAccount } from "@/auth/current-account";
import { safeCallbackPath } from "@/auth/redirects";
import { serverEnv } from "@/env";

import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in - Country Topics" };

const ERROR_MESSAGES: Record<string, string> = {
  [NOT_INVITED_ERROR]:
    "This site is invite-only during the pilot, and that address has not been invited.",
  [EMAIL_NOT_VERIFIED_ERROR]:
    "Google has not verified that account's email address. Use another account or an email link.",
  INVALID_TOKEN:
    "That sign-in link has expired or was already used. Ask for a new one.",
  EXPIRED_TOKEN: "That sign-in link has expired. Ask for a new one.",
};
const GENERIC_ERROR = "Sign-in did not work. Please try again.";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (await currentAccount())
    redirect(safeCallbackPath(params.callbackURL, serverEnv().siteUrl));

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
        callbackURL={safeCallbackPath(params.callbackURL, serverEnv().siteUrl)}
      />
    </section>
  );
}
