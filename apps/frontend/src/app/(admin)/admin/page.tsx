import {
  type AdminCollection,
  type AdminPage,
  type AdminRow,
  relatedTitle,
} from "@countrytopics/contracts";
import Link from "next/link";
import type { ReactNode } from "react";

import { ADMIN_GROUPS, COLLECTION_TEXT, valueLabel } from "@/admin/collections";
import { AdminRefusal } from "@/admin/components/AdminRefusal";
import { AdminShell } from "@/admin/components/AdminShell";
import { readDashboard } from "@/admin/dashboard";
import { adminGate, createHref, readableIn } from "@/admin/gate";
import { formatDateTime } from "@/format";

// Rendered for each request with the staff member's cookie, never cached.
export const dynamic = "force-dynamic";

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The start of what someone wrote, for a line in a list. */
function shortened(value: unknown, length = 90): string {
  const characters = Array.from(text(value).replace(/\s+/g, " ").trim());
  return characters.length > length
    ? `${characters.slice(0, length - 1).join("")}…`
    : characters.join("");
}

function recordLink(collection: AdminCollection, id: string) {
  return `/admin/collections/${collection}/${encodeURIComponent(id)}`;
}

/** One of the dashboard's lists, with a link to the whole of it. */
function Panel({
  title,
  page,
  all,
  empty,
  children,
}: {
  title: string;
  page: AdminPage;
  /** The list it is the start of. */
  all: { href: string; label: string };
  empty: string;
  children: (row: AdminRow) => ReactNode;
}) {
  const id = `dashboard-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="admin-card" aria-labelledby={id}>
      <h2 id={id}>
        {title}
        {page.totalDocs > 0 && (
          <span className="admin-badge">{page.totalDocs}</span>
        )}
      </h2>
      {page.docs.length === 0 ? (
        <p className="admin-muted">{empty}</p>
      ) : (
        <ul className="admin-dashboard-list">
          {page.docs.map((row) => (
            <li key={row.id}>{children(row)}</li>
          ))}
        </ul>
      )}
      <p>
        <Link href={all.href}>{all.label}</Link>
      </p>
    </section>
  );
}

/**
 * The admin's start (ADR 0014, phase 11): what waits for staff (drafts
 * ready for review, open reports, new feedback), what they worked on
 * lately, and every collection, grouped, as Payload's dashboard lists
 * them.
 */
export default async function AdminHome() {
  const gate = await adminGate("/admin");
  if (!gate.ok) return <AdminRefusal {...gate} />;
  const { account } = gate;
  const dashboard = await readDashboard(account);
  return (
    <AdminShell account={account}>
      <section className="admin-stack">
        <h1>Dashboard</h1>
        <div className="admin-dashboard">
          <Panel
            title="Ready for review"
            page={dashboard.review}
            all={{
              href: "/admin/collections/topics?readyForReview=yes&page=1",
              label: "Every topic ready for review",
            }}
            empty="No drafts are waiting for review."
          >
            {(row) => (
              <>
                <Link href={recordLink("topics", row.id)}>
                  {text(row.title) || "Untitled topic"}
                </Link>
                <span className="admin-muted">
                  {" "}
                  · updated {formatDateTime(text(row.updatedAt))}
                </span>
              </>
            )}
          </Panel>
          <Panel
            title="Open reports"
            page={dashboard.reports}
            all={{
              href: "/admin/collections/comment-reports?status=open&page=1",
              label: "Every open report",
            }}
            empty="No reports are open."
          >
            {(row) => (
              <>
                <Link href={recordLink("comment-reports", row.id)}>
                  {valueLabel("comment-reports", "reason", text(row.reason))}
                </Link>
                <span className="admin-muted">
                  {": "}
                  {shortened(relatedTitle("comments", row.comment)?.title) ||
                    "a comment"}
                </span>
              </>
            )}
          </Panel>
          <Panel
            title="New feedback"
            page={dashboard.feedback}
            all={{
              href: "/admin/collections/feedback?status=new&page=1",
              label: "All new feedback",
            }}
            empty="No new feedback."
          >
            {(row) => (
              <Link href={recordLink("feedback", row.id)}>
                {shortened(row.message) || "Feedback"}
              </Link>
            )}
          </Panel>
          <Panel
            title="Your recent topics"
            page={dashboard.mine}
            all={{
              href: "/admin/collections/topics?page=1",
              label: "Every topic",
            }}
            empty="You have not edited a topic yet."
          >
            {(row) => (
              <>
                <Link href={recordLink("topics", row.id)}>
                  {text(row.title) || "Untitled topic"}
                </Link>
                <span className="admin-muted">
                  {" "}
                  · {valueLabel("topics", "state", text(row.state))}
                </span>
              </>
            )}
          </Panel>
          <Panel
            title="Latest changes"
            page={dashboard.changes}
            all={{
              href: "/admin/collections/topic-changes?page=1",
              label: "The whole change log",
            }}
            empty="No topic has been published yet."
          >
            {(row) => (
              <>
                <Link href={recordLink("topic-changes", row.id)}>
                  {valueLabel("topic-changes", "kind", text(row.kind))}:{" "}
                  {relatedTitle("topics", row.topic)?.title || "a topic"}
                </Link>
                <span className="admin-muted">
                  {" "}
                  · {formatDateTime(text(row.createdAt))}
                </span>
              </>
            )}
          </Panel>
        </div>

        {ADMIN_GROUPS.map((group) => {
          const collections = readableIn(group, account);
          return (
            <section key={group} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`}>{group}</h2>
              <ul className="admin-cards">
                {collections.map((collection) => {
                  const create = createHref(collection, account);
                  return (
                    <li key={collection} className="admin-card">
                      <h3>
                        <Link href={`/admin/collections/${collection}`}>
                          {COLLECTION_TEXT[collection].plural}
                        </Link>
                      </h3>
                      {COLLECTION_TEXT[collection].description && (
                        <p className="admin-muted">
                          {COLLECTION_TEXT[collection].description}
                        </p>
                      )}
                      {create && (
                        <p>
                          <Link href={create}>
                            Create new
                            <span className="admin-visually-hidden">
                              {" "}
                              {COLLECTION_TEXT[
                                collection
                              ].singular.toLowerCase()}
                            </span>
                          </Link>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </section>
    </AdminShell>
  );
}
