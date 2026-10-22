import { isAdminCollection } from "@countrytopics/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readList } from "@/admin/backend";
import { COLLECTION_TEXT } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { ListView } from "@/admin/components/ListView";
import { adminGate, canRead, createHref } from "@/admin/gate";
import { listHref, readListState, type SearchParams } from "@/admin/list-state";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  return isAdminCollection(collection)
    ? {
        title: `${COLLECTION_TEXT[collection].plural} - Admin - Country Topics`,
      }
    : {};
}

/** One collection's list (ListView), at the address Payload's panel uses. */
export default async function CollectionList({ params, searchParams }: Props) {
  const { collection } = await params;
  if (!isAdminCollection(collection)) notFound();
  const state = readListState(collection, await searchParams);
  const gate = await adminGate(listHref(collection, state));
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const text = COLLECTION_TEXT[collection];
  if (!canRead(collection, gate.account)) {
    return (
      <AdminShell account={gate.account}>
        <section className="admin-card narrow">
          <h1>{text.plural}</h1>
          <p>Only admins can see {text.plural.toLowerCase()}.</p>
        </section>
      </AdminShell>
    );
  }
  const { page, capped } = await readList(collection, state);
  // An old link, from before records were removed: the last page instead.
  if (
    page.docs.length === 0 &&
    page.totalPages > 0 &&
    state.page > page.totalPages
  ) {
    redirect(listHref(collection, { ...state, page: page.totalPages }));
  }
  return (
    <AdminShell account={gate.account} current={collection}>
      <ListView
        collection={collection}
        state={state}
        page={page}
        capped={capped}
        createHref={createHref(collection, gate.account)}
      />
    </AdminShell>
  );
}
