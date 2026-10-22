"use client";

import {
  COMMENT_REPORT_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASON_LABELS,
  COMMENT_REPORT_REASONS,
  type CommentReportReason,
  commentReportProblem,
} from "@countrytopics/domain";
import { useId, useState } from "react";

import { sendReport } from "./comments-api";
import styles from "./comments.module.css";

/** Reports a comment to the moderators, with a reason and an optional note. */
export function ReportForm({
  commentId,
  onReported,
  onCancel,
}: {
  commentId: string;
  onReported: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState<CommentReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setError("Choose what is wrong with the comment.");
      return;
    }
    const trimmed = note.trim();
    const problem = commentReportProblem(reason, trimmed);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendReport(commentId, reason, trimmed);
      onReported();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <form className={`${styles.form} ${styles.report}`} onSubmit={submit}>
      <fieldset className={styles.reasons}>
        <legend>What is wrong with this comment?</legend>
        {COMMENT_REPORT_REASONS.map((value) => (
          <label key={value} className={styles.reason}>
            <input
              type="radio"
              name={`${id}-reason`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {COMMENT_REPORT_REASON_LABELS[value]}
          </label>
        ))}
      </fieldset>
      <div className={styles.field}>
        <label htmlFor={`${id}-note`}>
          Note for the moderators{reason === "other" ? "" : " (optional)"}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={COMMENT_REPORT_NOTE_MAX_LENGTH}
          rows={2}
        />
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
