import {
  type AdminCollection,
  isAdminCollection,
} from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { readRecordTitle } from "@/admin/backend";
import { COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { PanelLink } from "@/admin/components/PanelLink";
import { adminGate, canRead, createHref } from "@/admin/gate";
import { isUuid } from "@/admin/list-state";
import { EDITORS } from "@/admin/records/editors";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

/**
 * The phase of ADR 0014 that builds the editors not built yet. Topics and
 * their changes have pages of their own (collections/topics,
 * collections/topic-changes), which Next.js picks before this one.
 */
const EDITOR_PHASE: Partial<Record<AdminCollection, number>> = {
  comments: 10,
  "comment-reports": 10,
  users: 10,
  invitations: 10,
  feedback: 10,
  "audit-log": 10,
};

type Props = {
  params: Promise<{ collection: string; id: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
};

/** What the save that led here did, said once. */
const NOTICES: Record<string, string> = { created: "Created." };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection, id } = await params;
  if (!isAdminCollection(collection)) return {};
  const { singular } = COLLECTION_TEXT[collection];
  return {
    title: `${id === "create" ? `New ${singular.toLowerCase()}` : singular} - Admin - Country Topics`,
  };
}

/**
 * A record, at the address Payload's panel uses: its editor, or a new
 * record's at `create`. A collection whose editor comes in a later phase
 * names the record and, on this machine, opens it in Payload's panel.
 */
export default async function RecordPage({ params, searchParams }: Props) {
  const { collection, id } = await params;
  const { saved } = await searchParams;
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
  const editor = EDITORS[collection];
  const page = (title: string, body: ReactNode) => (
    <AdminShell account={gate.account} current={collection}>
      <section className="admin-stack">
        <p className="admin-muted">
          <Link href={`/admin/collections/${collection}`}>{text.plural}</Link>
        </p>
        <h1>{title}</h1>
        {body}
      </section>
    </AdminShell>
  );

  if (editor) {
    if (id === "create" && editor.create) {
      const noun = text.singular.toLowerCase();
      return page(
        `New ${noun}`,
        createHref(collection, gate.account) ? (
          editor.create(gate.account)
        ) : (
          <p className="admin-notice">
            Only admins create {text.plural.toLowerCase()}.
          </p>
        ),
      );
    }
    const record = await editor.record(
      id,
      gate.account,
      typeof saved === "string" && Object.hasOwn(NOTICES, saved)
        ? NOTICES[saved]
        : undefined,
    );
    if (!record) notFound();
    return page(
      record.title || `Untitled ${text.singular.toLowerCase()}`,
      record.body,
    );
  }

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
  return page(
    record.title || `Untitled ${text.singular.toLowerCase()}`,
    <div className="admin-card">
      <p>
        This {text.singular.toLowerCase()}&apos;s editor comes with ADR
        0014&apos;s phase {EDITOR_PHASE[collection]}.
      </p>
      <PanelLink path={here} />
    </div>,
  );
}
