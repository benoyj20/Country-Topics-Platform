import { ADMIN_LISTS, isAdminCollection } from "@countrytopics/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readList, readListLocks, readListSettings } from "@/admin/backend";
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

/**
 * One collection's list (ListView), at the address Payload's panel uses.
 * Its bare address opens it as the staff member last left it.
 */
export default async function CollectionList({ params, searchParams }: Props) {
  const { collection } = await params;
  if (!isAdminCollection(collection)) notFound();
  const asked = await searchParams;
  const state = readListState(collection, asked);
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
  const settings = await readListSettings(collection);
  if (Object.keys(asked).length === 0 && settings.query) {
    const remembered = listHref(
      collection,
      readListState(
        collection,
        Object.fromEntries(new URLSearchParams(settings.query)),
      ),
    );
    if (remembered !== listHref(collection, state)) redirect(remembered);
  }
  const columns = settings.columns ?? ADMIN_LISTS[collection].columns;
  const { page, capped, where } = await readList(collection, state, columns);
  // An old link, from before records were removed: the last page instead.
  if (
    page.docs.length === 0 &&
    page.totalPages > 0 &&
    state.page > page.totalPages
  ) {
    redirect(listHref(collection, { ...state, page: page.totalPages }));
  }
  const editing = await readListLocks(
    collection,
    page.docs.map((row) => row.id),
    gate.account.id,
  );
  return (
    <AdminShell account={gate.account} current={collection}>
      <ListView
        collection={collection}
        state={state}
        page={page}
        capped={capped}
        createHref={createHref(collection, gate.account)}
        columns={columns}
        settings={settings}
        role={gate.account.role}
        matching={where}
        editing={editing}
      />
    </AdminShell>
  );
}
