"use client";

import { useState } from "react";

import { authClient } from "@/auth/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function SignInForm({
  googleEnabled,
  callbackURL,
}: {
  googleEnabled: boolean;
  callbackURL: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL,
      errorCallbackURL: "/sign-in",
    });
    setStatus(
      error
        ? {
            kind: "error",
            message: error.message ?? "The link could not be sent. Try again.",
          }
        : { kind: "sent", email },
    );
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
        <button
          type="submit"
          className="button secondary"
          disabled={status.kind === "sending"}
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
