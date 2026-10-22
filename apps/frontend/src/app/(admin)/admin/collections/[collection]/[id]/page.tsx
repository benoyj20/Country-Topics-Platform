import { isAdminCollection } from "@countrytopics/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { adminGate, canRead, createHref } from "@/admin/gate";
import { EDITORS } from "@/admin/records/editors";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

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
 * record's at `create` where staff make them. Topics and their changes
 * have pages of their own (collections/topics, collections/topic-changes),
 * which Next.js picks before this one.
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
  const editor = EDITORS[collection];
  const gate = await adminGate(
    `/admin/collections/${collection}/${encodeURIComponent(id)}`,
  );
  if (!gate.ok) return <AdminRefusal {...gate} />;
  if (!canRead(collection, gate.account)) notFound();
  const text = COLLECTION_TEXT[collection];

  let title: string;
  let body: ReactNode;
  if (id === "create" && editor.create) {
    title = `New ${text.singular.toLowerCase()}`;
    body = createHref(collection, gate.account) ? (
      editor.create(gate.account)
    ) : (
      <p className="admin-notice">
        Only admins create {text.plural.toLowerCase()}.
      </p>
    );
  } else {
    const record = await editor.record(
      id,
      gate.account,
      typeof saved === "string" && Object.hasOwn(NOTICES, saved)
        ? NOTICES[saved]
        : undefined,
    );
    if (!record) notFound();
    title = record.title || `Untitled ${text.singular.toLowerCase()}`;
    body = record.body;
  }
  return (
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
}
