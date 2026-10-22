"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { deleteAccount } from "@/components/account-api";
import { CommentApiError } from "@/components/comments/comments-api";

/** A member deletes their own account (ADR 0011). */
export function DeleteAccountPanel({
  email,
  recentSignInMinutes,
}: {
  email: string;
  /** How recently they must have signed in (src/account/deletion.ts). */
  recentSignInMinutes: number;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    text: string;
    signInAgain: boolean;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(typed);
    } catch (failure) {
      setError({
        text:
          failure instanceof Error ? failure.message : "Something went wrong.",
        signInAgain:
          failure instanceof CommentApiError &&
          failure.code === "sign-in-again",
      });
      setBusy(false);
      return;
    }
    // The sessions went with the account; this clears the browser's cookie.
    await authClient.signOut().catch(() => undefined);
    router.push("/account/deleted");
    router.refresh();
  }

  async function signInAgain() {
    setBusy(true);
    await authClient.signOut().catch(() => undefined);
    router.push("/sign-in?callbackURL=%2Faccount%23delete-account");
    router.refresh();
  }

  return (
    <form id="delete-account" className="panel stack" onSubmit={submit}>
      <h2>Delete your account</h2>
      <p>Deleting your account cannot be undone. It:</p>
      <ul>
        <li>erases the text of your comments; replies by others stay;</li>
        <li>deletes your notifications, your feedback, and your sign-in;</li>
        <li>
          keeps your votes in comment scores and your reports for moderators,
          without your name.
        </li>
      </ul>
      <p className="muted">
        You need a new invitation to come back. For your safety, you must have
        signed in within the last {recentSignInMinutes} minutes.
      </p>
      <label htmlFor="delete-confirm">
        Type your email address, <strong>{email}</strong>, to confirm
      </label>
      <input
        id="delete-confirm"
        type="email"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        required
      />
      {error ? (
        <p className="notice error" role="alert">
          {error.text}
        </p>
      ) : null}
      <div className="actions">
        {error?.signInAgain ? (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={signInAgain}
          >
            Sign in again
          </button>
        ) : (
          <button type="submit" className="button danger" disabled={busy}>
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        )}
      </div>
    </form>
  );
}
