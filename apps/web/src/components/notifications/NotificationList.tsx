"use client";

import { COMMENT_REPORT_REASON_LABELS } from "@countrytopics/domain";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchNotifications,
  formatCommentTime,
  markNotificationsRead,
} from "@/components/comments/comments-api";
import type {
  MemberNotification,
  ModerationNotification,
} from "@/notifications/types";

import styles from "./notifications.module.css";

// A member's notifications, newest first (ADR 0010). The ones shown are
// marked read once they have loaded; they keep their "New" label until
// the page is opened again.

function TopicLink({ notification }: { notification: MemberNotification }) {
  const { topic } = notification;
  if (!topic) return <>a topic that is no longer public</>;
  return (
    <Link href={`/topics/${topic.slug}#comment-${notification.commentId}`}>
      {topic.title}
    </Link>
  );
}

function ModerationText({
  notification,
}: {
  notification: ModerationNotification;
}) {
  const topic = <TopicLink notification={notification} />;
  const reason = notification.reason
    ? ` (${COMMENT_REPORT_REASON_LABELS[notification.reason].toLowerCase()})`
    : "";
  if (notification.status === "removed") {
    return (
      <span>
        An admin removed your comment on {topic}
        {reason}, as the law requires. Its text is gone.
      </span>
    );
  }
  if (notification.status === "visible") {
    return (
      <span>
        A moderator hid your comment on {topic}, then showed it again.
      </span>
    );
  }
  return (
    <span>
      A moderator hid your comment on {topic}
      {reason}. Others no longer see it.
    </span>
  );
}

/** Not being marked read only means they show as new next time. */
async function markRead(shown: MemberNotification[]): Promise<void> {
  await markNotificationsRead(
    shown.filter((item) => !item.read).map((item) => item.id),
  ).catch(() => undefined);
}

function Item({ notification }: { notification: MemberNotification }) {
  return (
    <li className={styles.item}>
      <p className={styles.line}>
        {notification.read ? null : <span className={styles.new}>New</span>}
        {notification.kind === "reply" ? (
          <span>
            <strong>{notification.author ?? "A former member"}</strong> replied
            to your comment on <TopicLink notification={notification} />.
          </span>
        ) : (
          <ModerationText notification={notification} />
        )}
      </p>
      {notification.excerpt ? (
        <p className={styles.excerpt}>{notification.excerpt}</p>
      ) : null}
      <time dateTime={notification.createdAt} className={styles.time}>
        {formatCommentTime(notification.createdAt)}
      </time>
    </li>
  );
}

export function NotificationList() {
  const [items, setItems] = useState<MemberNotification[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchNotifications(null, controller.signal).then(
      (page) => {
        setItems(page.notifications);
        setNextCursor(page.nextCursor);
        setState("idle");
        void markRead(page.notifications);
      },
      () => {
        if (!controller.signal.aborted) setState("failed");
      },
    );
    return () => controller.abort();
  }, [attempt]);

  async function loadMore() {
    if (!nextCursor) return;
    setState("loading");
    try {
      const page = await fetchNotifications(nextCursor);
      setItems((known) => [...(known ?? []), ...page.notifications]);
      setNextCursor(page.nextCursor);
      setState("idle");
      void markRead(page.notifications);
    } catch {
      setState("failed");
    }
  }

  if (!items) {
    return state === "failed" ? (
      <div className="notice error" role="alert">
        <p className={styles.flush}>Your notifications could not be loaded.</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setState("loading");
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </button>
      </div>
    ) : (
      <p className="muted" aria-live="polite">
        Loading notifications…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="muted">
        Nothing yet. You will see replies to your comments here, and any action
        a moderator takes on them.
      </p>
    );
  }
  return (
    <>
      <ol className={styles.list}>
        {items.map((notification) => (
          <Item key={notification.id} notification={notification} />
        ))}
      </ol>
      {nextCursor ? (
        <div>
          <button
            type="button"
            className="button secondary"
            disabled={state === "loading"}
            onClick={() => void loadMore()}
          >
            {state === "loading" ? "Loading…" : "Show older notifications"}
          </button>
          {state === "failed" ? (
            <span role="alert"> They could not be loaded. Try again.</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
