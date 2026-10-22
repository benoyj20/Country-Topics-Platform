import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate } from "@/admin/gate";
import { readEditorTopic, readTopicChanges } from "@/admin/topics/backend";
import { TopicChangeLog } from "@/admin/topics/TopicChangeLog";
import { TopicForm } from "@/admin/topics/TopicForm";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Topic - Admin - Country Topics" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
};

/** What the save that led here did, said once. */
const NOTICES: Record<string, string> = {
  draft: "Draft saved.",
  published: "Published.",
  restored:
    "The version was restored as the newest draft. Check it, then publish it with a change note.",
  duplicated:
    "This is a copy, saved as a new draft. Change what differs, then publish it.",
};

/** A topic's editor, at the address Payload's panel uses. */
export default async function TopicEditor({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;
  const gate = await adminGate(
    `/admin/collections/topics/${encodeURIComponent(id)}`,
  );
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const [topic, changes] = await Promise.all([
    readEditorTopic(id),
    readTopicChanges(id),
  ]);
  if (!topic) notFound();
  return (
    <AdminShell account={gate.account} current="topics">
      <section className="admin-stack">
        <p className="admin-muted admin-crumbs">
          <Link href="/admin/collections/topics">Topics</Link>
        </p>
        <h1>{topic.values.title || "Untitled topic"}</h1>
        <TopicForm
          id={topic.id}
          values={topic.values}
          status={topic.status}
          canEdit={gate.account.role === "admin"}
          notice={
            typeof saved === "string" && Object.hasOwn(NOTICES, saved)
              ? NOTICES[saved]
              : undefined
          }
          changeLog={<TopicChangeLog changes={changes} />}
        />
      </section>
    </AdminShell>
  );
}
