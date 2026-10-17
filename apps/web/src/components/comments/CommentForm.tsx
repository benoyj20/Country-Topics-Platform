"use client";

import {
  COMMENT_BODY_MAX_LENGTH,
  commentBodyProblem,
  DISPLAY_NAME_MAX_LENGTH,
  displayNameProblem,
  normalizeCommentBody,
  normalizeDisplayName,
} from "@countrytopics/domain";
import { useId, useState } from "react";

import { CommentApiError, saveDisplayName } from "./comments-api";
import styles from "./comments.module.css";

/** The counter shows once this much of the limit is used. */
const COUNTER_FROM = 0.8;

/**
 * Writes a comment or a reply. A member who has not chosen the name shown
 * with their comments chooses it here, with their first one.
 */
export function CommentForm({
  label,
  submitLabel,
  needsName,
  onNameSaved,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  label: string;
  submitLabel: string;
  needsName: boolean;
  onNameSaved: (displayName: string) => void;
  /** Posts the text; throws CommentApiError to show its message. */
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  // The server can still ask for a name, if it was cleared meanwhile.
  const [nameRefused, setNameRefused] = useState(false);
  const askName = needsName || nameRefused;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = normalizeCommentBody(text);
    const nameToSave = normalizeDisplayName(name);
    const problem =
      (askName ? displayNameProblem(nameToSave) : null) ??
      commentBodyProblem(body);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (askName) {
        onNameSaved(await saveDisplayName(nameToSave));
        setNameRefused(false);
      }
      await onSubmit(body);
      setText("");
    } catch (failure) {
      if (
        failure instanceof CommentApiError &&
        failure.code === "display-name-required"
      ) {
        setNameRefused(true);
      }
      setError(
        failure instanceof Error ? failure.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  const used = text.length / COMMENT_BODY_MAX_LENGTH;
  return (
    <form className={styles.form} onSubmit={submit}>
      {askName ? (
        <div className={styles.field}>
          <label htmlFor={`${id}-name`}>Your public name</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="nickname"
            aria-describedby={`${id}-name-help`}
            required
          />
          <p id={`${id}-name-help`} className={styles.help}>
            Shown with everything you post, instead of your email or sign-in
            name. You can change it on your account page.
          </p>
        </div>
      ) : null}
      <div className={styles.field}>
        <label htmlFor={`${id}-body`}>{label}</label>
        <textarea
          id={`${id}-body`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={COMMENT_BODY_MAX_LENGTH}
          rows={4}
          required
          autoFocus={autoFocus}
        />
        {used >= COUNTER_FROM ? (
          <p className={styles.help} aria-live="polite">
            {text.length.toLocaleString("en")} of{" "}
            {COMMENT_BODY_MAX_LENGTH.toLocaleString("en")} characters
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Posting…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="button secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
