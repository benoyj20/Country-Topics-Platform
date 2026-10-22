import { redirect } from "next/navigation";

import { currentAccount } from "@/backend/account";
import { NotificationList } from "@/components/notifications/NotificationList";

export const metadata = { title: "Notifications - Country Topics" };

// Personal, so rendered for each request; the list itself loads in the
// browser from /api/v1/account/notifications (ADR 0010).
export default async function NotificationsPage() {
  if (!(await currentAccount())) {
    redirect("/sign-in?callbackURL=%2Fnotifications");
  }
  return (
    <section className="stack">
      <h1>Notifications</h1>
      <NotificationList />
    </section>
  );
}
