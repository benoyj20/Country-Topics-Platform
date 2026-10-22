"use client";

import type { Refusal } from "@countrytopics/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RefusalSummary } from "../components/RefusalSummary";
import { useRefusalFocus } from "../editor-guards";
import { deleteRecord } from "../write";

/**
 * Deletes a record that has no form, such as a video, after asking; the
 * backend refuses one that others still use, and says why.
 */
export function DeleteButton({
  collection,
  id,
  noun,
}: {
  collection: string;
  id: string;
  noun: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [summaryRef, refused] = useRefusalFocus();

  async function remove() {
    if (working) return;
    if (!window.confirm(`Delete this ${noun}? It cannot be brought back.`)) {
      return;
    }
    setWorking(true);
    const answer = await deleteRecord(collection, id, () => null);
    if (answer.ok) {
      router.push(`/admin/collections/${collection}`);
      return;
    }
    setWorking(false);
    setRefusal(answer.refusal);
    refused();
  }

  return (
    <>
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button secondary danger"
          disabled={working}
          onClick={() => void remove()}
        >
          {working ? "Deleting…" : "Delete"}
        </button>
      </div>
      {refusal && (
        <RefusalSummary
          ref={summaryRef}
          heading="Not deleted"
          refusal={refusal}
          order={[]}
          fieldName={(key) => key}
        />
      )}
    </>
  );
}
