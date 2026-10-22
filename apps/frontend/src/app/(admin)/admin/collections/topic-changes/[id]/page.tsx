import { recordOf } from "@countrytopics/contracts";
import { TOPIC_CHANGE_LABELS } from "@countrytopics/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { recordName } from "@/admin/record-name";
import { adminGate } from "@/admin/gate";
import { readTopicChange } from "@/admin/topics/backend";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Topic change - Admin - Country Topics",
};

type Props = { params: Promise<{ id: string }> };

/**
 * One entry of a topic's change log. Entries are written by the topic's
 * publishes and never edited, so this page only shows one.
 */
export default async function TopicChange({ params }: Props) {
  const { id } = await params;
  const gate = await adminGate(
    `/admin/collections/topic-changes/${encodeURIComponent(id)}`,
  );
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const change = await readTopicChange(id);
  if (!change) notFound();
  const topic = change.topic ? recordOf("topics", change.topic) : null;
  const rows: [string, ReactNode][] = [
    ["Kind", TOPIC_CHANGE_LABELS[change.kind]],
    [
      "Topic",
      topic ? (
        <Link href={`/admin/collections/topics/${topic.id}`}>
          {recordName(topic)}
        </Link>
      ) : (
        "None"
      ),
    ],
    ["Note", change.note],
    [
      "Version",
      topic && change.version ? (
        <Link
          href={`/admin/collections/topics/${topic.id}/versions/${change.version}`}
        >
          The version published
        </Link>
      ) : (
        "Not recorded"
      ),
    ],
    [
      "By",
      change.actor
        ? recordName(recordOf("users", change.actor))
        : "Not recorded",
    ],
    ["When", formatDateTime(change.createdAt)],
  ];
  return (
    <AdminShell account={gate.account} current="topic-changes">
      <section className="admin-stack">
        <p className="admin-muted admin-crumbs">
          <Link href="/admin/collections/topic-changes">Topic changes</Link>
        </p>
        <h1>{change.note}</h1>
        <dl className="admin-details wide">
          {rows.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="admin-muted">
          Change log entries are written when a topic is published and are never
          edited.
        </p>
      </section>
    </AdminShell>
  );
}
