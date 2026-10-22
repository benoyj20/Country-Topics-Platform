"use client";

import type { BulkAction } from "@countrytopics/contracts";
import {
  CHANGE_NOTE_MAX_LENGTH,
  COMMENT_REPORT_REASON_LABELS,
  MODERATION_REASONS,
} from "@countrytopics/domain";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type BulkInputs = { changeNote?: string; moderationReason?: string };

/**
 * What a bulk action asks before it runs: what it will do to how many
 * records, and what it needs, such as a change note for topics published
 * before, or why comments are hidden.
 */
export function BulkDialog({
  action,
  count,
  noun,
  onRun,
  onClose,
}: {
  action: BulkAction;
  count: number;
  /** "3 topics". */
  noun: string;
  onRun: (inputs: BulkInputs) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [changeNote, setChangeNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const asksNote = action.inputs?.includes("changeNote") ?? false;
  const asksReason = action.inputs?.includes("moderationReason") ?? false;

  // Opened as it mounts, closed as it unmounts.
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (asksReason && !reason) {
      setError("Choose why they are hidden: their authors are told.");
      return;
    }
    onRun({ changeNote, moderationReason: reason });
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form className="admin-stack" onSubmit={submit} noValidate>
        <h2 id={`${id}-title`}>
          {action.label}: {noun}
        </h2>
        <p>
          {action.confirm?.(count) ??
            `${action.label} ${noun}? The backend checks each one.`}
        </p>
        {asksNote && (
          <div className="admin-field">
            <label htmlFor={`${id}-note`}>Change note</label>
            <p id={`${id}-note-hint`} className="admin-muted">
              Needed for topics published before: shown in each one&apos;s
              public change log.
            </p>
            <textarea
              id={`${id}-note`}
              className="admin-input"
              rows={3}
              maxLength={CHANGE_NOTE_MAX_LENGTH}
              value={changeNote}
              aria-describedby={`${id}-note-hint`}
              onChange={(event) => setChangeNote(event.target.value)}
            />
          </div>
        )}
        {asksReason && (
          <div className="admin-field">
            <label htmlFor={`${id}-reason`}>
              Reason <span className="admin-required">(required)</span>
            </label>
            <p id={`${id}-reason-hint`} className="admin-muted">
              Each comment&apos;s author is told this.
            </p>
            <select
              id={`${id}-reason`}
              className="admin-input"
              value={reason}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                error ? `${id}-reason-hint ${id}-error` : `${id}-reason-hint`
              }
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            >
              <option value="">Choose a reason</option>
              {MODERATION_REASONS.map((value) => (
                <option key={value} value={value}>
                  {COMMENT_REPORT_REASON_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p id={`${id}-error`} className="admin-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-actions">
          <button
            type="submit"
            className={action.danger ? "admin-button danger" : "admin-button"}
          >
            {action.label}
          </button>
          <button
            type="button"
            className="admin-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
