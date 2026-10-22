"use client";

import type { Refusal } from "@countrytopics/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { restoreAsDraft } from "./save";

/**
 * Restores a version as the topic's newest draft, which is then checked
 * and published with a change note. A published topic is never replaced
 * by an old version directly (apps/web's topic hooks).
 */
export function RestoreVersion({
  topic,
  version,
}: {
  topic: string;
  version: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  async function restore() {
    if (
      !window.confirm(
        "Restore this version as the topic's newest draft? Nothing visitors see changes until it is published.",
      )
    ) {
      return;
    }
    setWorking(true);
    setRefusal(null);
    try {
      const answer = await restoreAsDraft(version);
      if (answer.ok) {
        router.push(`/admin/collections/topics/${topic}?saved=restored`);
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
          {working ? "Restoring…" : "Restore as draft"}
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
