import { isVersioned } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readRecordTitle } from "@/admin/backend";
import { COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate } from "@/admin/gate";
import type { ComparedVersions } from "@/admin/versions/compared-fields";
import {
  comparedWith,
  readPreviousVersion,
  readRecordVersion,
  readVersionChoices,
  type RecordVersion,
} from "@/admin/versions/backend";
import { RestoreVersion } from "@/admin/versions/RestoreVersion";
import { VersionCompare } from "@/admin/versions/VersionCompare";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ collection: string; id: string; version: string }>;
  searchParams: Promise<{ compare?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  return isVersioned(collection)
    ? {
        title: `${COLLECTION_TEXT[collection].singular} version - Admin - Country Topics`,
      }
    : {};
}

/** The two versions' values, the earlier first, of one collection. */
function compared(
  shown: RecordVersion,
  other: RecordVersion,
  shownFirst: boolean,
): ComparedVersions {
  const [before, after] = shownFirst ? [shown, other] : [other, shown];
  if (before.collection === "references" && after.collection === "references") {
    return {
      collection: "references",
      before: before.values,
      after: after.values,
    };
  }
  if (before.collection === "snippets" && after.collection === "snippets") {
    return {
      collection: "snippets",
      before: before.values,
      after: after.values,
    };
  }
  throw new Error("Versions of two collections cannot be compared.");
}

/**
 * One version of a reference or snippet, compared with the one before it
 * or another chosen, with a way to restore it, as in Payload's panel.
 */
export default async function RecordVersionPage({
  params,
  searchParams,
}: Props) {
  const { collection, id, version: versionId } = await params;
  if (!isVersioned(collection) || collection === "topics") notFound();
  const { compare } = await searchParams;
  const record = `/admin/collections/${collection}/${encodeURIComponent(id)}`;
  const versions = `${record}/versions`;
  const gate = await adminGate(`${versions}/${encodeURIComponent(versionId)}`);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const shown = await readRecordVersion(collection, versionId);
  // A version of another record is not this record's.
  if (!shown || shown.parent !== id) notFound();
  const [found, choices, previous] = await Promise.all([
    readRecordTitle(collection, id),
    readVersionChoices(collection, id),
    readPreviousVersion(collection, id, shown.updatedAt),
  ]);
  const otherId = comparedWith(shown.id, compare, previous, choices);
  const otherVersion = otherId
    ? await readRecordVersion(collection, otherId)
    : null;
  const other = otherVersion?.parent === id ? otherVersion : null;
  const text = COLLECTION_TEXT[collection];
  const title =
    found?.title ||
    (shown.collection === "references"
      ? shown.values.title
      : shown.values.caption) ||
    `Untitled ${text.singular.toLowerCase()}`;
  return (
    <AdminShell account={gate.account} current={collection}>
      <section className="admin-stack">
        <p className="admin-muted">
          <Link href={`/admin/collections/${collection}`}>{text.plural}</Link> /{" "}
          <Link href={record}>{title}</Link> /{" "}
          <Link href={versions}>Versions</Link>
        </p>
        <h1>Version of {formatDateTime(shown.updatedAt)}</h1>
        {gate.account.role === "admin" && (
          <RestoreVersion
            collection={collection}
            record={id}
            version={shown.id}
          />
        )}
        <VersionCompare
          shown={{ id: shown.id, updatedAt: shown.updatedAt }}
          other={other ? { id: other.id, updatedAt: other.updatedAt } : null}
          choices={choices}
          compared={(shownFirst) => compared(shown, other ?? shown, shownFirst)}
        />
      </section>
    </AdminShell>
  );
}
