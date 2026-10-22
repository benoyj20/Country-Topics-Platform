import { ADMIN_LISTS, isRecordId, isVersioned } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readRecordTitle } from "@/admin/backend";
import { COLLECTION_TEXT, fieldLabel } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate } from "@/admin/gate";
import { readVersions } from "@/admin/versions/backend";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  return isVersioned(collection)
    ? {
        title: `${COLLECTION_TEXT[collection].singular} versions - Admin - Country Topics`,
      }
    : {};
}

function pageNumber(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

/**
 * Every version of a reference or snippet, newest first, as Payload's
 * panel lists them: each save is kept. Topics have a page of their own
 * (collections/topics/[id]/versions), with their drafts and change notes.
 */
export default async function RecordVersions({ params, searchParams }: Props) {
  const { collection, id } = await params;
  if (!isVersioned(collection) || collection === "topics") notFound();
  const page = pageNumber((await searchParams).page);
  const record = `/admin/collections/${collection}/${encodeURIComponent(id)}`;
  const here = `${record}/versions`;
  const gate = await adminGate(here);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  if (!isRecordId(id)) notFound();
  const [found, versions] = await Promise.all([
    readRecordTitle(collection, id),
    readVersions(collection, id, page),
  ]);
  if (!found) notFound();
  const text = COLLECTION_TEXT[collection];
  const { title } = ADMIN_LISTS[collection];
  return (
    <AdminShell account={gate.account} current={collection}>
      <section className="admin-stack">
        <p className="admin-muted">
          <Link href={`/admin/collections/${collection}`}>{text.plural}</Link> /{" "}
          <Link href={record}>
            {found.title || `Untitled ${text.singular.toLowerCase()}`}
          </Link>
        </p>
        <h1>Versions</h1>
        <p className="admin-muted">
          {versions.totalDocs} saved{" "}
          {versions.totalDocs === 1 ? "version" : "versions"}. Open one to
          compare it with another, or to restore it.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Saved</th>
                <th scope="col">{fieldLabel(collection, title)}</th>
              </tr>
            </thead>
            <tbody>
              {versions.docs.map((version, index) => (
                <tr key={version.id}>
                  <td>
                    <Link href={`${here}/${version.id}`}>
                      {formatDateTime(version.updatedAt)}
                    </Link>
                    {page === 1 && index === 0 && (
                      <span className="admin-badge">Current</span>
                    )}
                  </td>
                  <td>{String(version.version[title] ?? "") || "Untitled"}</td>
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
