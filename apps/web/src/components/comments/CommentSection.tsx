"use client";

import {
  type CommentSort,
  type CommentVoteValue,
  DEFAULT_COMMENT_SORT,
  isCommentSort,
} from "@countrytopics/domain";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type {
  CommentPage,
  CommentThread,
  CommentViewer,
  PublicComment,
} from "@/comments/types";

import {
  fetchReplies,
  fetchThreads,
  fetchViewer,
  postComment,
  sendVote,
} from "./comments-api";
import { CommentForm } from "./CommentForm";
import { CommentItem, type CommentStanding } from "./CommentItem";
import styles from "./comments.module.css";

// A topic's discussion (F6, ADR 0009), loaded in the browser: topic pages
// are cached for everyone, so comments come from the public list API and
// the reader's own votes, reports, and comments from a separate uncached
// request. What the reader posts or votes is shown at once, without asking
// for the list again.

const SORT_LABELS: Record<CommentSort, string> = {
  top: "Top",
  new: "Newest",
  old: "Oldest",
};

const NOBODY: CommentViewer = {
  account: null,
  votes: {},
  reported: [],
  mine: [],
};

type Loaded = CommentPage & { sort: CommentSort };

function idsOf(threads: CommentThread[]): string[] {
  return threads.flatMap((thread) => [
    thread.id,
    ...thread.replies.map((reply) => reply.id),
  ]);
}

/** Adds what a later answer says about more comments to what is known. */
function merge(known: CommentViewer, more: CommentViewer): CommentViewer {
  return {
    account: more.account,
    votes: { ...known.votes, ...more.votes },
    reported: [...new Set([...known.reported, ...more.reported])],
    mine: [...new Set([...known.mine, ...more.mine])],
  };
}

function withoutRepeats<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

/** "1 comment", "12 comments". */
function commentCount(total: number): string {
  return `${total} ${total === 1 ? "comment" : "comments"}`;
}

export function CommentSection({ slug }: { slug: string }) {
  const [sort, setSort] = useState<CommentSort>(DEFAULT_COMMENT_SORT);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<Loaded>();
  const [failure, setFailure] = useState<{
    sort: CommentSort;
    message: string;
  }>();
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const [viewer, setViewer] = useState<CommentViewer>(NOBODY);
  const [viewerState, setViewerState] = useState<
    "loading" | "loaded" | "failed"
  >("loading");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyLoads, setReplyLoads] = useState<
    Record<string, "loading" | "failed">
  >({});

  /** Learns the reader's part in more comments; visitors learn nothing. */
  const learnViewer = useCallback((ids: string[], signal?: AbortSignal) => {
    fetchViewer(ids, signal).then(
      (answer) => {
        setViewer((known) => merge(known, answer));
        setViewerState("loaded");
      },
      () => {
        if (!signal?.aborted) setViewerState("failed");
      },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchThreads(slug, sort, null, controller.signal).then(
      (loaded) => {
        setPage({ ...loaded, sort });
        setMore("idle");
        setReplyLoads({});
        learnViewer(idsOf(loaded.threads), controller.signal);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          sort,
          message:
            error instanceof Error
              ? error.message
              : "The comments could not be loaded.",
        });
      },
    );
    return () => controller.abort();
  }, [slug, sort, attempt, learnViewer]);

  const current = page?.sort === sort ? page : undefined;
  const failed = failure?.sort === sort && !current ? failure : undefined;
  const signedIn = viewer.account !== null;
  const needsName = signedIn && !viewer.account?.displayName;

  function standing(comment: PublicComment): CommentStanding {
    return {
      signedIn,
      mine: viewer.mine.includes(comment.id),
      vote: viewer.votes[comment.id] ?? 0,
      reported: viewer.reported.includes(comment.id),
      open: current?.open ?? false,
    };
  }

  /** Changes one comment, wherever it is shown. */
  function update(
    id: string,
    change: (comment: PublicComment) => Partial<PublicComment>,
  ) {
    setPage(
      (loaded) =>
        loaded && {
          ...loaded,
          threads: loaded.threads.map((thread) =>
            thread.id === id
              ? { ...thread, ...change(thread) }
              : {
                  ...thread,
                  replies: thread.replies.map((reply) =>
                    reply.id === id ? { ...reply, ...change(reply) } : reply,
                  ),
                },
          ),
        },
    );
  }

  function setVote(id: string, value: CommentVoteValue) {
    setViewer((known) => {
      const votes = { ...known.votes };
      if (value === 0) delete votes[id];
      else votes[id] = value;
      return { ...known, votes };
    });
  }

  async function vote(comment: PublicComment, value: CommentVoteValue) {
    const previous = viewer.votes[comment.id] ?? 0;
    // Shown at once; put back if the vote does not count.
    setVote(comment.id, value);
    update(comment.id, (shown) => ({ score: shown.score + value - previous }));
    try {
      const counted = await sendVote(comment.id, value);
      update(comment.id, () => ({ score: counted.score }));
    } catch (error) {
      setVote(comment.id, previous);
      update(comment.id, (shown) => ({
        score: shown.score - value + previous,
      }));
      throw error;
    }
  }

  function remember(comment: PublicComment) {
    setViewer((known) => ({ ...known, mine: [...known.mine, comment.id] }));
  }

  async function postThread(body: string) {
    const comment = await postComment(slug, body, null);
    remember(comment);
    const thread: CommentThread = {
      ...comment,
      replyCount: 0,
      replies: [],
      moreReplies: null,
    };
    setPage((loaded) => {
      if (!loaded) return loaded;
      // Oldest first puts it at the end, once the end is loaded; otherwise
      // it goes first, where its writer sees it.
      const atEnd = loaded.sort === "old" && loaded.nextCursor === null;
      return {
        ...loaded,
        total: loaded.total + 1,
        threads: atEnd
          ? [...loaded.threads, thread]
          : [thread, ...loaded.threads],
      };
    });
  }

  async function postReply(threadId: string, body: string) {
    const reply = await postComment(slug, body, threadId);
    remember(reply);
    setReplyingTo(null);
    setPage(
      (loaded) =>
        loaded && {
          ...loaded,
          total: loaded.total + 1,
          threads: loaded.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  replyCount: thread.replyCount + 1,
                  replies: [...thread.replies, reply],
                }
              : thread,
          ),
        },
    );
  }

  async function loadMore() {
    if (!current?.nextCursor) return;
    setMore("loading");
    try {
      const next = await fetchThreads(slug, sort, current.nextCursor);
      setPage(
        (loaded) =>
          loaded && {
            ...loaded,
            threads: withoutRepeats([...loaded.threads, ...next.threads]),
            nextCursor: next.nextCursor,
          },
      );
      setMore("idle");
      learnViewer(idsOf(next.threads));
    } catch {
      setMore("failed");
    }
  }

  async function loadReplies(thread: CommentThread) {
    if (!thread.moreReplies) return;
    setReplyLoads((loads) => ({ ...loads, [thread.id]: "loading" }));
    try {
      const next = await fetchReplies(thread.id, thread.moreReplies);
      setPage(
        (loaded) =>
          loaded && {
            ...loaded,
            threads: loaded.threads.map((shown) =>
              shown.id === thread.id
                ? {
                    ...shown,
                    replies: withoutRepeats([
                      ...shown.replies,
                      ...next.replies,
                    ]),
                    moreReplies: next.nextCursor,
                  }
                : shown,
            ),
          },
      );
      setReplyLoads((loads) =>
        Object.fromEntries(
          Object.entries(loads).filter(([id]) => id !== thread.id),
        ),
      );
      learnViewer(next.replies.map((reply) => reply.id));
    } catch {
      setReplyLoads((loads) => ({ ...loads, [thread.id]: "failed" }));
    }
  }

  function markReported(id: string) {
    setViewer((known) => ({ ...known, reported: [...known.reported, id] }));
  }

  function replyForm(thread: CommentThread) {
    if (replyingTo !== thread.id) return null;
    return (
      <CommentForm
        label={`Reply to ${thread.author ?? "this thread"}`}
        submitLabel="Post reply"
        needsName={needsName}
        onNameSaved={(displayName) =>
          setViewer((known) => ({ ...known, account: { displayName } }))
        }
        onSubmit={(body) => postReply(thread.id, body)}
        onCancel={() => setReplyingTo(null)}
        autoFocus
      />
    );
  }

  const canWrite = signedIn && current?.open === true;
  const signInHref = `/sign-in?callbackURL=${encodeURIComponent(`/topics/${slug}#comments`)}`;

  return (
    <section className={styles.section} aria-labelledby="comments">
      <h2 id="comments">
        Discussion
        {current ? (
          <span className={styles.total}> · {commentCount(current.total)}</span>
        ) : null}
      </h2>
      <noscript>
        <p className="muted">The discussion needs JavaScript to load.</p>
      </noscript>

      {current && !current.open ? (
        <p className="notice">
          This topic is archived, so its discussion is closed. The comments stay
          for the record.
        </p>
      ) : null}
      {current?.open && viewerState === "loaded" && !signedIn ? (
        <p>
          <Link href={signInHref}>Sign in</Link> to comment, reply, and vote.
        </p>
      ) : null}
      {current?.open && viewerState === "failed" ? (
        <p className="notice error" role="alert">
          Your account could not be checked, so commenting is off for now.{" "}
          <button
            type="button"
            className={styles.tool}
            onClick={() => {
              setViewerState("loading");
              learnViewer(idsOf(current.threads));
            }}
          >
            Try again
          </button>
        </p>
      ) : null}
      {canWrite ? (
        <CommentForm
          label="Add a comment"
          submitLabel="Post comment"
          needsName={needsName}
          onNameSaved={(displayName) =>
            setViewer((known) => ({ ...known, account: { displayName } }))
          }
          onSubmit={postThread}
        />
      ) : null}

      {failed ? (
        <div className="notice error" role="alert">
          <p className={styles.flush}>{failed.message}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setFailure(undefined);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!current && !failed ? (
        <p className="muted" aria-live="polite">
          Loading comments…
        </p>
      ) : null}

      {current && current.total > 0 ? (
        <label className={styles.sort}>
          Sort by{" "}
          <select
            value={sort}
            onChange={(event) => {
              if (isCommentSort(event.target.value)) {
                setSort(event.target.value);
              }
            }}
          >
            {(Object.keys(SORT_LABELS) as CommentSort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {current && current.threads.length === 0 ? (
        <p className="muted">
          {current.open ? "No comments yet." : "No one commented."}
        </p>
      ) : null}

      {current && current.threads.length > 0 ? (
        <ol className={styles.threads}>
          {current.threads.map((thread) => (
            <li key={thread.id}>
              <CommentItem
                comment={thread}
                standing={standing(thread)}
                onVote={(value) => vote(thread, value)}
                onReply={canWrite ? () => setReplyingTo(thread.id) : undefined}
                onReported={() => markReported(thread.id)}
              >
                {thread.replies.length > 0 ? (
                  <ol className={styles.replies}>
                    {thread.replies.map((reply) => (
                      <li key={reply.id}>
                        <CommentItem
                          comment={reply}
                          standing={standing(reply)}
                          onVote={(value) => vote(reply, value)}
                          // Replies to a reply join its thread: two levels.
                          onReply={
                            canWrite
                              ? () => setReplyingTo(thread.id)
                              : undefined
                          }
                          onReported={() => markReported(reply.id)}
                        />
                      </li>
                    ))}
                  </ol>
                ) : null}
                {thread.moreReplies ? (
                  <p className={styles.flush}>
                    <button
                      type="button"
                      className={styles.tool}
                      disabled={replyLoads[thread.id] === "loading"}
                      onClick={() => void loadReplies(thread)}
                    >
                      {replyLoads[thread.id] === "loading"
                        ? "Loading replies…"
                        : `Show more replies (${thread.replyCount - thread.replies.length})`}
                    </button>
                    {replyLoads[thread.id] === "failed" ? (
                      <span role="alert">
                        {" "}
                        The replies could not be loaded. Try again.
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {replyForm(thread)}
              </CommentItem>
            </li>
          ))}
        </ol>
      ) : null}

      {current?.nextCursor ? (
        <div className={styles.actions}>
          <button
            type="button"
            className="button secondary"
            disabled={more === "loading"}
            onClick={() => void loadMore()}
          >
            {more === "loading" ? "Loading…" : "Show more comments"}
          </button>
          {more === "failed" ? (
            <span role="alert">
              More comments could not be loaded. Try again.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
