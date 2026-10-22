import { editorTopic } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { readTopicVersion } from "@/admin/features/topics/backend";
import { TopicView } from "@/admin/features/topics/TopicView";
import { adminGate } from "@/admin/gate";
import {
  comparedWith,
  readPreviousVersion,
  readVersionChoices,
} from "@/admin/versions/backend";
import { RestoreVersion } from "@/admin/versions/RestoreVersion";
import { VersionCompare } from "@/admin/versions/VersionCompare";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Topic version - Admin - Country Topics",
};

type Props = {
  params: Promise<{ id: string; version: string }>;
  searchParams: Promise<{ compare?: string | string[] }>;
};

type TopicVersion = NonNullable<Awaited<ReturnType<typeof readTopicVersion>>>;

const parentOf = (version: TopicVersion) =>
  typeof version.parent === "string" ? version.parent : version.parent.id;

/** A version's fields, as the editor shows them. */
function valuesOf(version: TopicVersion, id: string) {
  return editorTopic(
    {
      ...version.version,
      id,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    },
    version.version.body,
  ).values;
}

const statusOf = (version: TopicVersion) =>
  version.version._status === "published" ? "Published" : "Draft";

/**
 * One version of a topic, compared with the one before it or another
 * chosen, then shown whole, with a way to restore it as a draft.
 */
export default async function TopicVersionPage({
  params,
  searchParams,
}: Props) {
  const { id, version: versionId } = await params;
  const { compare } = await searchParams;
  const versions = `/admin/collections/topics/${encodeURIComponent(id)}/versions`;
  const gate = await adminGate(`${versions}/${encodeURIComponent(versionId)}`);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const version = await readTopicVersion(versionId);
  // A version of another topic is not this topic's.
  if (!version || parentOf(version) !== id) notFound();
  const [choices, previous] = await Promise.all([
    readVersionChoices("topics", id),
    readPreviousVersion("topics", id, version.updatedAt),
  ]);
  const otherId = comparedWith(version.id, compare, previous, choices);
  const found = otherId ? await readTopicVersion(otherId) : null;
  const other = found && parentOf(found) === id ? found : null;
  const values = valuesOf(version, id);
  const otherValues = other ? valuesOf(other, id) : values;
  return (
    <AdminShell account={gate.account} current="topics">
      <section className="admin-stack">
        <p className="admin-muted admin-crumbs">
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
          <RestoreVersion
            collection="topics"
            record={id}
            version={version.id}
          />
        )}
        <VersionCompare
          shown={{
            id: version.id,
            updatedAt: version.updatedAt,
            status: statusOf(version),
          }}
          other={
            other
              ? {
                  id: other.id,
                  updatedAt: other.updatedAt,
                  status: statusOf(other),
                }
              : null
          }
          choices={choices}
          compared={(shownFirst) => ({
            collection: "topics",
            before: shownFirst ? values : otherValues,
            after: shownFirst ? otherValues : values,
          })}
        />
        <details className="admin-card">
          <summary>This version in full</summary>
          <TopicView values={values} />
        </details>
      </section>
    </AdminShell>
  );
}
