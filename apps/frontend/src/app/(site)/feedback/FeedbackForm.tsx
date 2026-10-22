"use client";

import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  type FeedbackKind,
  feedbackMessageProblem,
  normalizeFeedbackMessage,
} from "@countrytopics/domain";
import Link from "next/link";
import { useState } from "react";

import { sendFeedback } from "@/components/account-api";

/** Sends feedback about the site; `page` is the path it is about, if any. */
export function FeedbackForm({ page }: { page: string | null }) {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) {
      setError("Choose what your feedback is about.");
      return;
    }
    const tidied = normalizeFeedbackMessage(message);
    const problem = feedbackMessageProblem(tidied);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback({ kind, message: tidied, page });
      setSent(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="stack">
        <p className="notice" role="status">
          Thank you. Your feedback was sent.
        </p>
        {page ? (
          <p>
            <Link href={page}>Back to the page you were on</Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <fieldset className="choices">
        <legend>What is it about?</legend>
        {FEEDBACK_KINDS.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="feedback-kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            {FEEDBACK_KIND_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <label htmlFor="feedback-message">Your feedback</label>
      <textarea
        id="feedback-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
        rows={6}
        required
      />
      <p className="muted small">
        {page ? (
          <>
            Sent with the page you came from: <code>{page}</code>.{" "}
          </>
        ) : null}
        Please leave out other people&apos;s personal details.
      </p>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  );
}
