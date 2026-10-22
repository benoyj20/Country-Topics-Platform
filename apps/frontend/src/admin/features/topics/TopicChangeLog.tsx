import { recordOf, type topicChangeSchema } from "@countrytopics/contracts";
import { TOPIC_CHANGE_LABELS } from "@countrytopics/domain";
import Link from "next/link";
import type * as z from "zod";

import { recordName } from "@/admin/record-name";
import { formatDateTime } from "@/format";

type TopicChange = z.infer<typeof topicChangeSchema>;

/** A topic's public change log, as staff see it: who made each change too. */
export function TopicChangeLog({ changes }: { changes: TopicChange[] }) {
  return (
    <section className="admin-card" aria-labelledby="change-log">
      <h2 id="change-log">Change log</h2>
      {changes.length === 0 ? (
        <p className="admin-muted">
          Nothing published yet. Each publish adds an entry, shown on the
          topic&apos;s page.
        </p>
      ) : (
        <ol className="admin-log">
          {changes.map((change) => (
            <li key={change.id}>
              <p>
                <strong>{TOPIC_CHANGE_LABELS[change.kind]}</strong>,{" "}
                <Link href={`/admin/collections/topic-changes/${change.id}`}>
                  {formatDateTime(change.createdAt)}
                </Link>
              </p>
              <p>{change.note}</p>
              {change.actor && (
                <p className="admin-muted">
                  By {recordName(recordOf("users", change.actor))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
