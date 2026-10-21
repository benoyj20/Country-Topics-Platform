"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/auth/client";
import { NavLink } from "@/components/NavLink";
import {
  fetchUnreadNotifications,
  NOTIFICATIONS_READ_EVENT,
} from "@/components/comments/comments-api";
import { UNREAD_COUNT_MAX } from "@/notifications/limits";

/**
 * "Notifications", with the unread count, for signed-in members (ADR
 * 0010). Asked for after the page loads, like AccountLink, and again when
 * the reader comes back to the tab and once notifications are marked
 * read; not on every page change, as each ask reads the primary database.
 */
export function NotificationsLink() {
  const { data } = authClient.useSession();
  const userId = data?.user.id;
  const [unread, setUnread] = useState(0);
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    const recheck = () => setChecks((count) => count + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener(NOTIFICATIONS_READ_EVENT, recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetchUnreadNotifications(controller.signal).then(
      (answer) => setUnread(answer.unread),
      // The count is a convenience; the page itself still works.
      () => undefined,
    );
    return () => controller.abort();
  }, [userId, checks]);

  if (!userId) return null;
  const shown =
    unread >= UNREAD_COUNT_MAX ? `${UNREAD_COUNT_MAX - 1}+` : String(unread);
  return (
    <NavLink
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${shown} unread` : undefined}
    >
      Notifications
      {unread > 0 ? <span className="count">{shown}</span> : null}
    </NavLink>
  );
}
