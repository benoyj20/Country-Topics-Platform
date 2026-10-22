import { editorTopic } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate } from "@/admin/gate";
import { readTopicVersion } from "@/admin/topics/backend";
import { RestoreVersion } from "@/admin/topics/RestoreVersion";
import { TopicView } from "@/admin/topics/TopicView";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Topic version - Admin - Country Topics",
};

type Props = { params: Promise<{ id: string; version: string }> };

/** One version of a topic, whole, with a way to restore it as a draft. */
export default async function TopicVersion({ params }: Props) {
  const { id, version: versionId } = await params;
  const versions = `/admin/collections/topics/${encodeURIComponent(id)}/versions`;
  const gate = await adminGate(`${versions}/${encodeURIComponent(versionId)}`);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const version = await readTopicVersion(versionId);
  const parent =
    typeof version?.parent === "string" ? version.parent : version?.parent.id;
  // A version of another topic is not this topic's.
  if (!version || parent !== id) notFound();
  const { values } = editorTopic(
    {
      ...version.version,
      id,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    },
    version.version.body,
  );
  return (
    <AdminShell account={gate.account} current="topics">
      <section className="admin-stack">
        <p className="admin-muted">
          <Link href="/admin/collections/topics">Topics</Link> /{" "}
          <Link href={`/admin/collections/topics/${id}`}>
            {values.title || "Untitled topic"}
          </Link>{" "}
          / <Link href={versions}>Versions</Link>
        </p>
        <h1>Version of {formatDateTime(version.updatedAt)}</h1>
        <p className="admin-muted">
          {version.version._status === "published"
            ? "A published version."
            : "A draft."}
        </p>
        {gate.account.role === "admin" && (
          <RestoreVersion topic={id} version={version.id} />
        )}
        <TopicView values={values} />
      </section>
    </AdminShell>
  );
}
