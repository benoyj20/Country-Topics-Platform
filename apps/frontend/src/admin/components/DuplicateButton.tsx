"use client";

import type { DuplicatedCollection, Refusal } from "@countrytopics/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { duplicateRecord } from "../write";

/**
 * Duplicates the saved record and opens the copy, as Payload's panel does.
 * The copy is made from what is saved, so unsaved changes are not in it.
 */
export function DuplicateButton({
  collection,
  id,
  noun,
  dirty,
  disabled,
  onRefused,
}: {
  collection: DuplicatedCollection;
  id: string;
  noun: string;
  /** The form has changes the copy will not have. */
  dirty: boolean;
  disabled: boolean;
  onRefused: (refusal: Refusal) => void;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function duplicate() {
    if (
      !window.confirm(
        dirty
          ? `Duplicate this ${noun} as it was last saved? The copy opens next, and your unsaved changes here are lost: save first to keep them.`
          : `Make a copy of this ${noun}?`,
      )
    ) {
      return;
    }
    setWorking(true);
    const answer = await duplicateRecord(collection, id);
    if (!answer.ok) {
      setWorking(false);
      onRefused(answer.refusal);
      return;
    }
    router.push(
      `/admin/collections/${collection}/${encodeURIComponent(answer.result)}?saved=duplicated`,
    );
    setWorking(false);
  }

  return (
    <button
      type="button"
      className="admin-button secondary"
      disabled={disabled || working}
      onClick={() => void duplicate()}
    >
      {working ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
