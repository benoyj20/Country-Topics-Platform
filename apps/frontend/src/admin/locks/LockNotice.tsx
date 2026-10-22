"use client";

import { useState } from "react";

import type { LockState } from "./use-document-lock";

/**
 * What an editor says about its lock: who else is editing, with a way to
 * take over, as Payload's panel offers; or that the lock could not be
 * taken. Nothing while the reader holds it.
 */
export function LockNotice({
  state,
  noun,
  onTakeOver,
}: {
  state: LockState;
  /** What the record is called, such as "topic". */
  noun: string;
  onTakeOver: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  if (state.kind === "failed") {
    return (
      <p className="admin-notice" role="status">
        Others cannot see that you are editing this {noun}: it could not be
        locked. Saving still works.
      </p>
    );
  }
  if (state.kind !== "theirs") return null;
  const name = state.holder?.email ?? "Another staff member";

  async function takeOver() {
    if (
      !window.confirm(
        `Take over editing this ${noun}? ${name} can no longer save, and loses any changes they have not saved.`,
      )
    ) {
      return;
    }
    setWorking(true);
    try {
      await onTakeOver();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="admin-notice warning admin-lock" role="status">
      <p>
        <strong>
          {name} {state.tookOver ? "took over editing" : "is editing"} this{" "}
          {noun}.
        </strong>{" "}
        {state.tookOver
          ? "Your changes here can no longer be saved. Copy anything you need, or take over again."
          : "You can read it, but not change it while they do."}
      </p>
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button secondary"
          disabled={working}
          onClick={() => void takeOver()}
        >
          {working ? "Taking over…" : "Take over editing"}
        </button>
      </div>
    </div>
  );
}
