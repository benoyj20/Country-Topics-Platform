"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/auth/client";
import {
  fetchUnreadNotifications,
  NOTIFICATIONS_READ_EVENT,
} from "@/components/comments/comments-api";
import { UNREAD_COUNT_MAX } from "@/notifications/limits";

/**
 * "Notifications", with the unread count, for signed-in members (ADR
 * 0010). Asked for after the page loads, like AccountLink, and again on
 * each navigation and once notifications are marked read.
 */
export function NotificationsLink() {
  const { data } = authClient.useSession();
  const userId = data?.user.id;
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    const recheck = () => setChecks((count) => count + 1);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, recheck);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, recheck);
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
  }, [userId, pathname, checks]);

  if (!userId) return null;
  const shown =
    unread >= UNREAD_COUNT_MAX ? `${UNREAD_COUNT_MAX - 1}+` : String(unread);
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${shown} unread` : undefined}
    >
      Notifications
      {unread > 0 ? <span className="count">{shown}</span> : null}
    </Link>
  );
}
