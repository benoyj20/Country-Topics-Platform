import {
  type AdminCollection,
  isAdminCollection,
} from "@countrytopics/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readRecordTitle } from "@/admin/backend";
import { COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { PanelLink } from "@/admin/components/PanelLink";
import { adminGate, canRead } from "@/admin/gate";
import { isUuid } from "@/admin/list-state";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

/**
 * The phase of ADR 0014 that builds each collection's editor. Built ones
 * have pages of their own (collections/topics, collections/topic-changes),
 * which Next.js picks before this one.
 */
const EDITOR_PHASE: Record<
  Exclude<AdminCollection, "topics" | "topic-changes">,
  number
> = {
  references: 9,
  snippets: 9,
  videos: 9,
  media: 9,
  "link-archives": 9,
  individuals: 9,
  countries: 9,
  categories: 9,
  tags: 9,
  comments: 10,
  "comment-reports": 10,
  users: 10,
  invitations: 10,
  feedback: 10,
  "audit-log": 10,
};

type Props = { params: Promise<{ collection: string; id: string }> };

/**
 * A record found in a list, at the address Payload's panel uses. Its
 * editor comes in a later phase; until then it names the record and, on
 * this machine, opens it in Payload's panel.
 */
export default async function RecordPage({ params }: Props) {
  const { collection, id } = await params;
  if (
    !isAdminCollection(collection) ||
    collection === "topics" ||
    collection === "topic-changes"
  ) {
    notFound();
  }
  const here = `/admin/collections/${collection}/${encodeURIComponent(id)}`;
  const gate = await adminGate(here);
  if (!gate.ok) return <AdminRefusal {...gate} />;
  if (!canRead(collection, gate.account)) notFound();
  const text = COLLECTION_TEXT[collection];
  // Not a record: one of the panel's own pages, such as `create`.
  if (!isUuid(id)) {
    return (
      <AdminShell account={gate.account} current={collection}>
        <section className="admin-card narrow">
          <h1>Not built yet</h1>
          <p>
            This part of the {text.plural.toLowerCase()} admin comes with ADR
            0014&apos;s phase {EDITOR_PHASE[collection]}.
          </p>
          <PanelLink path={here} />
        </section>
      </AdminShell>
    );
  }
  const record = await readRecordTitle(collection, id);
  if (!record) notFound();
  return (
    <AdminShell account={gate.account} current={collection}>
      <section className="admin-stack">
        <p className="admin-muted">
          <Link href={`/admin/collections/${collection}`}>{text.plural}</Link>
        </p>
        <h1>{record.title || `Untitled ${text.singular.toLowerCase()}`}</h1>
        <div className="admin-card">
          <p>
            This {text.singular.toLowerCase()}&apos;s editor comes with ADR
            0014&apos;s phase {EDITOR_PHASE[collection]}.
          </p>
          <PanelLink path={here} />
        </div>
      </section>
    </AdminShell>
  );
}
