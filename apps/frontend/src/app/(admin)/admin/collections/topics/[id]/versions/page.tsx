import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readRecordTitle } from "@/admin/backend";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import {
  readTopicChanges,
  readTopicVersions,
} from "@/admin/features/topics/backend";
import { adminGate } from "@/admin/gate";
import { isUuid } from "@/admin/list-state";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Topic versions - Admin - Country Topics",
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function pageNumber(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

/**
 * Every version of a topic, newest first, as Payload's panel lists them:
 * each save is kept, and each publish has its change note.
 */
export default async function TopicVersions({ params, searchParams }: Props) {
  const { id } = await params;
  const page = pageNumber((await searchParams).page);
  const here = `/admin/collections/topics/${encodeURIComponent(id)}/versions`;
  const gate = await adminGate(here);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  if (!isUuid(id)) notFound();
  const [topic, versions] = await Promise.all([
    readRecordTitle("topics", id),
    readTopicVersions(id, page),
  ]);
  if (!topic) notFound();
  // The change notes of the versions on this page, however old.
  const changes = await readTopicChanges(
    id,
    versions.docs.map((version) => version.id),
  );
  const notes = new Map(
    changes.flatMap((change) =>
      change.version ? [[change.version, change.note]] : [],
    ),
  );
  const title = topic.title || "Untitled topic";
  return (
    <AdminShell account={gate.account} current="topics">
      <section className="admin-stack">
        <p className="admin-muted admin-crumbs">
          <Link href="/admin/collections/topics">Topics</Link> /{" "}
          <Link href={`/admin/collections/topics/${id}`}>{title}</Link>
        </p>
        <h1>Versions</h1>
        <p className="admin-muted">
          {versions.totalDocs} saved{" "}
          {versions.totalDocs === 1 ? "version" : "versions"}. A version can be
          restored as the newest draft.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Saved</th>
                <th scope="col">Status</th>
                <th scope="col">Title</th>
                <th scope="col">Change note</th>
              </tr>
            </thead>
            <tbody>
              {versions.docs.map((version) => (
                <tr key={version.id}>
                  <td>
                    <Link href={`${here}/${version.id}`}>
                      {formatDateTime(version.updatedAt)}
                    </Link>
                  </td>
                  <td>
                    {version.version._status === "published"
                      ? "Published"
                      : "Draft"}
                    {version.latest && (
                      <span className="admin-badge">Newest</span>
                    )}
                  </td>
                  <td>{version.version.title || "Untitled"}</td>
                  <td>{notes.get(version.id) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(versions.hasPrevPage || versions.hasNextPage) && (
          <nav className="admin-pages" aria-label="Pages">
            {versions.hasPrevPage && (
              <Link href={`${here}?page=${page - 1}`}>Newer versions</Link>
            )}
            <span>
              Page {versions.page} of {versions.totalPages}
            </span>
            {versions.hasNextPage && (
              <Link href={`${here}?page=${page + 1}`}>Older versions</Link>
            )}
          </nav>
        )}
      </section>
    </AdminShell>
  );
}
