import {
  isAdminCollection,
  personOf,
  type StoredAuditEntry,
} from "@countrytopics/contracts";
import Link from "next/link";

import { formatDateTime } from "@/format";

import { COLLECTION_TEXT } from "../collections";
import { personName } from "../record-name";

// An audit log entry, as Payload's panel shows it
// (apps/web/src/collections/AuditLog.ts): who did what to which record,
// and the details the backend recorded. Nobody changes it.

export function AuditEntryView({ entry }: { entry: StoredAuditEntry }) {
  const target = entry.targetCollection;
  const actor = personOf(entry.actor);
  return (
    <>
      <p className="admin-notice">
        Written by the backend when staff or the system change something. Nobody
        edits or deletes it.
      </p>
      <section className="admin-card" aria-labelledby="audit-entry">
        <h2 id="audit-entry">The entry</h2>
        <dl className="admin-details wide">
          <div>
            <dt>Action</dt>
            <dd>
              <code>{entry.action}</code>
            </dd>
          </div>
          <div>
            <dt>By</dt>
            <dd>
              {actor ? (
                <Link href={`/admin/collections/users/${actor.id}`}>
                  {personName(actor, { admin: true, staff: false })}
                </Link>
              ) : (
                "The system, or an account deleted since"
              )}
            </dd>
          </div>
          <div>
            <dt>Record</dt>
            <dd>
              {isAdminCollection(target) ? (
                <Link
                  href={`/admin/collections/${target}/${encodeURIComponent(entry.targetId)}`}
                >
                  {COLLECTION_TEXT[target].singular} {entry.targetId}
                </Link>
              ) : (
                `${target} ${entry.targetId}`
              )}
            </dd>
          </div>
          <div>
            <dt>When</dt>
            <dd>{formatDateTime(entry.createdAt)}</dd>
          </div>
        </dl>
      </section>
      <section className="admin-card" aria-labelledby="audit-details">
        <h2 id="audit-details">Details</h2>
        {entry.details === null || entry.details === undefined ? (
          <p className="admin-muted">None.</p>
        ) : (
          <pre className="admin-code-block">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        )}
      </section>
    </>
  );
}
