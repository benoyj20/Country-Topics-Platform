"use client";

import {
  type Refusal,
  restoreSearchParams,
  type VersionedCollection,
} from "@countrytopics/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { write } from "../write";

/** What restoring asks first, by collection. */
const QUESTIONS: Record<VersionedCollection, string> = {
  topics:
    "Restore this version as the topic's newest draft? Nothing visitors see changes until it is published.",
  references:
    "Restore this version? It replaces the reference as it is now, which stays in its history.",
  snippets:
    "Restore this version? It replaces the snippet as it is now, which stays in its history.",
};

/**
 * Restores a version, as Payload's panel does: a topic's as its newest
 * draft, which is then checked and published with a change note (a
 * published topic is never replaced by an old version directly); a
 * reference's or snippet's as the record itself.
 */
export function RestoreVersion({
  collection,
  record,
  version,
}: {
  collection: VersionedCollection;
  record: string;
  version: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  async function restore() {
    if (!window.confirm(QUESTIONS[collection])) return;
    setWorking(true);
    setRefusal(null);
    try {
      const answer = await write(
        "POST",
        `/api/${collection}/versions/${encodeURIComponent(version)}?${restoreSearchParams(collection)}`,
        undefined,
        () => null,
      );
      if (answer.ok) {
        router.push(
          `/admin/collections/${collection}/${encodeURIComponent(record)}?saved=restored`,
        );
      } else {
        setRefusal(answer.refusal);
      }
    } finally {
      setWorking(false);
    }
  }

  const messages = refusal
    ? [...refusal.general, ...Object.values(refusal.fields).flat()]
    : [];
  return (
    <div className="admin-stack">
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button"
          disabled={working}
          onClick={() => void restore()}
        >
          {working
            ? "Restoring…"
            : collection === "topics"
              ? "Restore as draft"
              : "Restore this version"}
        </button>
      </div>
      {messages.length > 0 && (
        <div className="admin-error-summary" role="alert">
          <h2>Not restored</h2>
          <ul>
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
