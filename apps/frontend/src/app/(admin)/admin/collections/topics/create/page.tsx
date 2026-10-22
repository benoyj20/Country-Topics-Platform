import { EMPTY_TOPIC } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate, createHref } from "@/admin/gate";
import { TopicForm } from "@/admin/topics/TopicForm";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New topic - Admin - Country Topics",
};

/** A new topic's editor; its first save creates it. */
export default async function NewTopic() {
  const gate = await adminGate("/admin/collections/topics/create");
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const allowed = createHref("topics", gate.account) !== undefined;
  return (
    <AdminShell account={gate.account} current="topics">
      <section className="admin-stack">
        <p className="admin-muted admin-crumbs">
          <Link href="/admin/collections/topics">Topics</Link>
        </p>
        <h1>New topic</h1>
        {allowed ? (
          <TopicForm id={null} values={EMPTY_TOPIC} status={null} canEdit />
        ) : (
          <p className="admin-notice">Only admins create topics.</p>
        )}
      </section>
    </AdminShell>
  );
}
