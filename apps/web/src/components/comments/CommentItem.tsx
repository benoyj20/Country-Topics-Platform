"use client";

import type { CommentVoteValue } from "@countrytopics/domain";
import { type ReactNode, useState } from "react";

import type { PublicComment } from "@/comments/types";
import { counted } from "@/public/format";

import { formatCommentTime } from "./comments-api";
import styles from "./comments.module.css";
import { ReportForm } from "./ReportForm";

/** What the reader may do with a comment, and has done. */
export type CommentStanding = {
  signedIn: boolean;
  /** The reader wrote it. */
  mine: boolean;
  vote: CommentVoteValue;
  reported: boolean;
  /** New comments and votes are taken (the topic is not archived). */
  open: boolean;
};

export function CommentItem({
  comment,
  standing,
  onVote,
  onReply,
  onReported,
  children,
}: {
  comment: PublicComment;
  standing: CommentStanding;
  /** Sets the reader's vote; throws an Error to show its message. */
  onVote: (value: CommentVoteValue) => Promise<void>;
  /** Opens a reply form; absent where replies cannot be written. */
  onReply?: () => void;
  onReported: () => void;
  /** A reply form and replies, under the comment. */
  children?: ReactNode;
}) {
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One vote at a time: a second click waits for the first to count.
  const [voting, setVoting] = useState(false);
  const canVote = standing.signedIn && !standing.mine && standing.open;

  async function vote(value: Exclude<CommentVoteValue, 0>) {
    setError(null);
    setVoting(true);
    try {
      // Choosing the same vote again takes it back.
      await onVote(standing.vote === value ? 0 : value);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The vote did not count.",
      );
    } finally {
      setVoting(false);
    }
  }

  return (
    <article
      className={styles.comment}
      aria-label={`Comment by ${comment.author ?? "a former member"}`}
    >
      <p className={styles.byline}>
        <strong>{comment.author ?? "Former member"}</strong>
        {standing.mine ? <span className={styles.you}>You</span> : null}
        <time dateTime={comment.createdAt} className={styles.time}>
          {formatCommentTime(comment.createdAt)}
        </time>
      </p>
      <p className={styles.body}>{comment.body}</p>
      <div className={styles.tools}>
        {canVote ? (
          <span className={styles.votes}>
            <button
              type="button"
              className={styles.vote}
              aria-label="Up vote"
              aria-pressed={standing.vote === 1}
              disabled={voting}
              onClick={() => void vote(1)}
            >
              ▲
            </button>
            <span className={styles.score}>
              {counted(comment.score, "point")}
            </span>
            <button
              type="button"
              className={styles.vote}
              aria-label="Down vote"
              aria-pressed={standing.vote === -1}
              disabled={voting}
              onClick={() => void vote(-1)}
            >
              ▼
            </button>
          </span>
        ) : (
          <span className={styles.score}>
            {counted(comment.score, "point")}
          </span>
        )}
        {onReply ? (
          <button type="button" className={styles.tool} onClick={onReply}>
            Reply
          </button>
        ) : null}
        {standing.signedIn && !standing.mine ? (
          standing.reported ? (
            <span className={styles.done}>Reported</span>
          ) : (
            <button
              type="button"
              className={styles.tool}
              aria-expanded={reporting}
              onClick={() => setReporting(!reporting)}
            >
              Report
            </button>
          )
        ) : null}
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {reporting && !standing.reported ? (
        <ReportForm
          commentId={comment.id}
          onReported={() => {
            setReporting(false);
            onReported();
          }}
          onCancel={() => setReporting(false)}
        />
      ) : null}
      {children}
    </article>
  );
}
