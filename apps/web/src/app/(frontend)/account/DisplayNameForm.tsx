"use client";

import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameProblem,
  normalizeDisplayName,
} from "@countrytopics/domain";
import { useState } from "react";

import { saveDisplayName } from "@/components/comments/comments-api";

/** The name shown publicly with the member's comments (ADR 0009). */
export function DisplayNameForm({ current }: { current: string | null }) {
  const [saved, setSaved] = useState(current);
  const [name, setName] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "done" | "error";
    text: string;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tidied = normalizeDisplayName(name);
    const problem = displayNameProblem(tidied);
    if (problem) {
      setMessage({ kind: "error", text: problem });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const stored = await saveDisplayName(tidied);
      setSaved(stored);
      setName(stored);
      setMessage({ kind: "done", text: "Saved." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>Public name</h2>
      <p className="muted">
        {saved
          ? "Shown with your comments, instead of your email or sign-in name. Changing it changes it on your past comments too."
          : "You have not chosen one yet. You will be asked for it with your first comment, or you can choose it here."}
      </p>
      <label htmlFor="display-name">Name shown with your comments</label>
      <input
        id="display-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        autoComplete="nickname"
        required
      />
      {message ? (
        <p
          className={message.kind === "error" ? "notice error" : "notice"}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <div>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </form>
  );
}
