"use client";

import {
  ADMIN_LISTS,
  type AdminCollection,
  listColumns,
  listPreferenceKey,
  PREFERENCES_PATH,
} from "@countrytopics/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { fieldLabel } from "../collections";

// What a list remembers per staff member (ADR 0014, phase 11), in
// Payload's preferences, which only their own account reads or writes:
// the columns they chose, and the search, filters, sort, and page size
// they last used, which the list's bare address opens with.

/** Saves the list's settings; the list still works when this fails. */
async function remember(
  collection: AdminCollection,
  query: string,
  columns: readonly string[] | null,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${PREFERENCES_PATH}/${listPreferenceKey(collection)}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: { query, columns } }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Remembers how the list is shown now, once it differs from what was
 * remembered: its address's query, page aside.
 */
export function RememberList({
  collection,
  query,
  remembered,
  columns,
}: {
  collection: AdminCollection;
  query: string;
  remembered: string;
  columns: readonly string[] | null;
}) {
  const columnKey = columns?.join(",") ?? "";
  useEffect(() => {
    if (query === remembered) return;
    void remember(collection, query, columnKey ? columnKey.split(",") : null);
  }, [collection, query, remembered, columnKey]);
  return null;
}

/** Chooses which of the fields the list can show are its columns. */
export function ColumnPicker({
  collection,
  columns,
  query,
}: {
  collection: AdminCollection;
  /** Shown now, in order. */
  columns: readonly string[];
  /** The list's remembered query, kept as it is. */
  query: string;
}) {
  const router = useRouter();
  const id = useId();
  const fields = Object.keys(ADMIN_LISTS[collection].fields);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(columns));
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  async function save(next: readonly string[] | null) {
    setState("saving");
    const ok = await remember(collection, query, next);
    setState(ok ? "idle" : "failed");
    if (ok) router.refresh();
  }

  const picked = fields.filter((field) => chosen.has(field));
  return (
    <details className="admin-columns">
      <summary>Columns</summary>
      <fieldset className="admin-choices">
        <legend className="admin-visually-hidden">Columns to show</legend>
        <div className="admin-column-grid">
          {fields.map((field) => (
            <label key={field} className="admin-check">
              <input
                type="checkbox"
                name={`${id}-columns`}
                checked={chosen.has(field)}
                onChange={(event) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(field);
                    else next.delete(field);
                    return next;
                  })
                }
              />
              {fieldLabel(collection, field)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="admin-muted">
        The first column opens each record. Your choice is kept for you alone.
      </p>
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button"
          disabled={picked.length === 0 || state === "saving"}
          onClick={() => void save(listColumns(collection, picked))}
        >
          {state === "saving" ? "Saving…" : "Show these columns"}
        </button>
        <button
          type="button"
          className="admin-button secondary"
          disabled={state === "saving"}
          onClick={() => {
            setChosen(new Set(ADMIN_LISTS[collection].columns));
            void save(null);
          }}
        >
          Use the usual columns
        </button>
      </div>
      {picked.length === 0 && (
        <p className="admin-field-error">Choose at least one column.</p>
      )}
      {state === "failed" && (
        <p className="admin-field-error" role="alert">
          The columns could not be saved. Try again in a moment.
        </p>
      )}
    </details>
  );
}
