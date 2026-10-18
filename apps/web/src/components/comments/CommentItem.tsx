"use client";

import { type CommentVoteValue, commentSegments } from "@countrytopics/domain";
import { Fragment, type ReactNode, useState } from "react";

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
  /** Its thread is locked: no new replies or votes. */
  locked: boolean;
  /** The reader is staff, with a link to moderate it. */
  staff: boolean;
};

/** Plain text, with web addresses as links that pass on no ranking. */
function CommentBody({ body }: { body: string }) {
  return (
    <p className={styles.body}>
      {commentSegments(body).map((segment, index) =>
        segment.href ? (
          <a
            key={index}
            href={segment.href}
            rel="ugc nofollow noopener noreferrer"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </p>
  );
}

function ModerateLink({ id }: { id: string }) {
  // The admin panel checks the reader's role and authenticator itself.
  return (
    <a href={`/admin/collections/comments/${id}`} className={styles.tool}>
      Moderate
    </a>
  );
}

export function CommentItem({
  comment,
  standing,
  onVote,
  onReply,
  onReported,
  threadLocked = false,
  linked = false,
  children,
}: {
  comment: PublicComment;
  standing: CommentStanding;
  /** Sets the reader's vote; throws an Error to show its message. */
  onVote: (value: CommentVoteValue) => Promise<void>;
  /** Opens a reply form; absent where replies cannot be written. */
  onReply?: () => void;
  onReported: () => void;
  /** For the comment that starts a thread: says the thread is locked. */
  threadLocked?: boolean;
  /** The comment a link to the page pointed at, shown highlighted. */
  linked?: boolean;
  /** A reply form and replies, under the comment. */
  children?: ReactNode;
}) {
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One vote at a time: a second click waits for the first to count.
  const [voting, setVoting] = useState(false);
  const canVote =
    standing.signedIn && !standing.mine && standing.open && !standing.locked;
  const articleClass = linked
    ? `${styles.comment} ${styles.linked}`
    : styles.comment;
  const lockedNote = threadLocked ? (
    <p className={styles.help}>
      A moderator locked this thread: it takes no new replies or votes.
    </p>
  ) : null;

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

  if (comment.hidden) {
    return (
      <article
        id={`comment-${comment.id}`}
        className={articleClass}
        aria-label={comment.deleted ? "Deleted comment" : "Hidden comment"}
      >
        <p className={`${styles.body} ${styles.hiddenNote}`}>
          {comment.deleted
            ? "This comment's author deleted their account."
            : "A moderator hid this comment."}
        </p>
        {standing.staff ? (
          <div className={styles.tools}>
            <ModerateLink id={comment.id} />
          </div>
        ) : null}
        {lockedNote}
        {children}
      </article>
    );
  }

  return (
    <article
      id={`comment-${comment.id}`}
      className={articleClass}
      aria-label={`Comment by ${comment.author ?? "a former member"}`}
    >
      <p className={styles.byline}>
        <strong>{comment.author ?? "Former member"}</strong>
        {standing.mine ? <span className={styles.you}>You</span> : null}
        <time dateTime={comment.createdAt} className={styles.time}>
          {formatCommentTime(comment.createdAt)}
        </time>
      </p>
      <CommentBody body={comment.body} />
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
        {standing.staff ? <ModerateLink id={comment.id} /> : null}
      </div>
      {lockedNote}
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
