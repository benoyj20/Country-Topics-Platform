"use client";

import { useState } from "react";

import { authClient } from "@/auth/client";
import { TURNSTILE_HEADER } from "@/auth/turnstile-shared";

import { TurnstileWidget } from "./TurnstileWidget";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

// Better Auth's codes for a missing or refused Turnstile token.
const CHECK_FAILED = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export function SignInForm({
  googleEnabled,
  callbackURL,
  turnstileSiteKey,
}: {
  googleEnabled: boolean;
  callbackURL: string;
  /** Set when the email form needs a Turnstile token (ADR 0010). */
  turnstileSiteKey: string | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [token, setToken] = useState<string | null>(null);
  // Each token works once: a new key asks the widget for another.
  const [tokenRequests, setTokenRequests] = useState(0);
  const [checkUnavailable, setCheckUnavailable] = useState(false);
  const waitingForCheck = Boolean(turnstileSiteKey) && !token;

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waitingForCheck) return;
    setStatus({ kind: "sending" });
    const { error } = await authClient.signIn.magicLink(
      { email, callbackURL, errorCallbackURL: "/sign-in" },
      token ? { headers: { [TURNSTILE_HEADER]: token } } : undefined,
    );
    if (!error) {
      setStatus({ kind: "sent", email });
      return;
    }
    if (turnstileSiteKey) setTokenRequests((count) => count + 1);
    setStatus({
      kind: "error",
      message:
        error.code && CHECK_FAILED.has(error.code)
          ? "The check that you are a person did not pass. Wait for it to finish, then try again."
          : (error.message ?? "The link could not be sent. Try again."),
    });
  }

  if (status.kind === "sent") {
    return (
      <p className="notice" role="status">
        If <strong>{status.email}</strong> is invited, a sign-in link is on its
        way. It works once and expires in 10 minutes.
      </p>
    );
  }

  return (
    <div className="stack">
      {googleEnabled && (
        <button
          type="button"
          className="button"
          onClick={() =>
            authClient.signIn.social({
              provider: "google",
              callbackURL,
              errorCallbackURL: "/sign-in",
            })
          }
        >
          Continue with Google
        </button>
      )}
      <form className="stack" onSubmit={sendLink}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {turnstileSiteKey ? (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            resetKey={tokenRequests}
            onToken={setToken}
            onUnavailable={() => setCheckUnavailable(true)}
          />
        ) : null}
        {checkUnavailable ? (
          <p className="notice error" role="alert">
            The check that you are a person could not load, so email links
            cannot be sent. Reload the page, or continue with Google.
          </p>
        ) : null}
        <button
          type="submit"
          className="button secondary"
          disabled={status.kind === "sending" || waitingForCheck}
        >
          {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {status.kind === "error" && (
        <p className="notice error" role="alert">
          {status.message}
        </p>
      )}
    </div>
  );
}
