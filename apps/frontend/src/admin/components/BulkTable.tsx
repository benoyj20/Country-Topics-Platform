"use client";

import {
  type AdminCollection,
  BULK_MATCHING_MAX,
  type BulkAction,
  bulkActions,
  bulkAnswerSchema,
  bulkBody,
  type BulkOutcome,
  bulkOutcome,
  bulkSearchParams,
  type BulkTarget,
  payloadRefusal,
} from "@countrytopics/contracts";
import type { Role } from "@countrytopics/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { COLLECTION_TEXT } from "../collections";
import { BulkDialog, type BulkInputs } from "./BulkDialog";

// A list's table with Payload's panel's bulk actions (ADR 0014, phase 11):
// rows are selected one by one, a page at a time, or every record the
// search and filters match, then published, archived, edited, or deleted
// in one request. The backend decides for each record; the result says
// which were done, which were refused and why, and which were left as
// they were.

export type BulkRow = {
  id: string;
  /** What the row's checkbox and the result call the record. */
  label: string;
  /** The row's cells, drawn on the server. */
  cells: ReactNode;
};

type Result =
  | { kind: "done"; action: BulkAction; outcome: BulkOutcome }
  | { kind: "failed"; action: BulkAction; messages: string[] };

export function BulkTable({
  collection,
  role,
  label,
  head,
  rows,
  matching,
}: {
  collection: AdminCollection;
  role: Role;
  /** The table's name, for screen readers. */
  label: string;
  /** The header row's cells, drawn on the server. */
  head: ReactNode;
  rows: BulkRow[];
  /** Every record the list matches, for a bulk action over all of them. */
  matching: { total: number; where: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  const actions = bulkActions(collection, role);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [asking, setAsking] = useState<BulkAction | null>(null);
  const [running, setRunning] = useState<BulkAction | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const pageBox = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const text = COLLECTION_TEXT[collection];

  // The selection is of the rows on screen; a new page starts afresh.
  const rowKey = rows.map((row) => row.id).join(",");
  const [shownRows, setShownRows] = useState(rowKey);
  if (rowKey !== shownRows) {
    setShownRows(rowKey);
    setSelected(new Set());
    setAllMatching(false);
  }

  const onPage = rows.filter((row) => selected.has(row.id)).length;
  const count = allMatching && matching ? matching.total : selected.size;
  useEffect(() => {
    if (pageBox.current) {
      pageBox.current.indeterminate = onPage > 0 && onPage < rows.length;
    }
  }, [onPage, rows.length]);
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  if (actions.length === 0) {
    return (
      <Table label={label}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>{row.cells}</tr>
          ))}
        </tbody>
      </Table>
    );
  }

  function toggle(id: string, checked: boolean) {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setAllMatching(false);
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function start(action: BulkAction) {
    setResult(null);
    if (action.inputs?.length || action.confirm || allMatching) {
      setAsking(action);
      return;
    }
    void run(action, {});
  }

  async function run(action: BulkAction, inputs: BulkInputs) {
    setAsking(null);
    setRunning(action);
    const ids = [...selected];
    const target: BulkTarget =
      allMatching && matching
        ? { kind: "matching", where: matching.where }
        : { kind: "ids", ids };
    try {
      const response = await fetch(
        `/api/${collection}?${bulkSearchParams(action, target)}`,
        {
          method: action.method,
          credentials: "same-origin",
          headers:
            action.method === "PATCH"
              ? { "content-type": "application/json" }
              : undefined,
          body:
            action.method === "PATCH"
              ? JSON.stringify(bulkBody(action, inputs))
              : undefined,
        },
      );
      const json: unknown = await response.json().catch(() => null);
      const answer = bulkAnswerSchema.safeParse(json);
      if (answer.success && (response.ok || response.status === 400)) {
        const outcome = bulkOutcome(
          answer.data,
          target.kind === "ids" ? ids : [],
        );
        setResult({ kind: "done", action, outcome });
        // Those refused or left out stay selected, to try again.
        setSelected(
          new Set([...outcome.refused.map((r) => r.id), ...outcome.skipped]),
        );
        setAllMatching(false);
      } else {
        const refusal = payloadRefusal(response.status, json, () => null);
        setResult({
          kind: "failed",
          action,
          messages: [
            ...refusal.general,
            ...Object.values(refusal.fields).flat(),
          ],
        });
      }
    } catch {
      setResult({
        kind: "failed",
        action,
        messages: [
          "The backend could not be reached, so this may not have been done. Reload the page to see what was.",
        ],
      });
    } finally {
      setRunning(null);
      router.refresh();
    }
  }

  const labels = new Map(rows.map((row) => [row.id, row.label]));
  const name = (id: string) =>
    labels.get(id) ?? `${text.singular} ${id.slice(-8)}`;
  const counted = (n: number) =>
    `${n} ${(n === 1 ? text.singular : text.plural).toLowerCase()}`;

  return (
    <div className="admin-stack">
      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          className={
            result.kind === "done" &&
            result.outcome.refused.length === 0 &&
            result.outcome.skipped.length === 0
              ? "admin-notice good"
              : "admin-notice error"
          }
        >
          {result.kind === "failed" ? (
            <>
              <p>
                <strong>{result.action.label}: nothing was done.</strong>
              </p>
              <ul>
                {result.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>
                <strong>
                  {result.action.done}: {counted(result.outcome.done.length)}.
                </strong>
              </p>
              {result.outcome.refused.length > 0 && (
                <>
                  <p>
                    {counted(result.outcome.refused.length)} could not be
                    changed:
                  </p>
                  <ul>
                    {result.outcome.refused.map((refused) => (
                      <li key={refused.id}>
                        <Link
                          href={`/admin/collections/${collection}/${encodeURIComponent(refused.id)}`}
                        >
                          {name(refused.id)}
                        </Link>
                        : {refused.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {result.outcome.skipped.length > 0 && (
                <p>
                  {counted(result.outcome.skipped.length)} left as{" "}
                  {result.outcome.skipped.length === 1 ? "it was" : "they were"}
                  :{" "}
                  {result.action.skipped ??
                    "the backend's rules do not let you change it."}{" "}
                  ({result.outcome.skipped.map(name).join(", ")})
                </p>
              )}
            </>
          )}
        </div>
      )}
      {count > 0 && (
        <div
          className="admin-bulk-bar"
          role="region"
          aria-label="Selected records"
        >
          <p>
            <strong>
              {allMatching
                ? `All ${counted(count)} that match`
                : `${counted(count)} selected`}
            </strong>
            {!allMatching &&
              matching &&
              onPage === rows.length &&
              matching.total > rows.length &&
              matching.total <= BULK_MATCHING_MAX && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="admin-link-button"
                    onClick={() => setAllMatching(true)}
                  >
                    Select all {matching.total} that match
                  </button>
                </>
              )}
          </p>
          <div className="admin-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={
                  action.danger
                    ? "admin-button secondary danger"
                    : "admin-button secondary"
                }
                disabled={running !== null}
                onClick={() => start(action)}
              >
                {running === action ? "Working…" : action.label}
              </button>
            ))}
            <button
              type="button"
              className="admin-link-button"
              disabled={running !== null}
              onClick={() => togglePage(false)}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
      <Table label={label}>
        <thead>
          <tr>
            <th scope="col" className="admin-select">
              <input
                ref={pageBox}
                type="checkbox"
                aria-label={`Select every ${text.singular.toLowerCase()} on this page`}
                checked={rows.length > 0 && onPage === rows.length}
                onChange={(event) => togglePage(event.target.checked)}
              />
            </th>
            {head}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={selected.has(row.id) ? "selected" : undefined}
            >
              <td className="admin-select">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.label}`}
                  checked={selected.has(row.id)}
                  onChange={(event) => toggle(row.id, event.target.checked)}
                />
              </td>
              {row.cells}
            </tr>
          ))}
        </tbody>
      </Table>
      {asking && (
        <BulkDialog
          action={asking}
          count={count}
          noun={counted(count)}
          onRun={(inputs) => void run(asking, inputs)}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}

function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="admin-table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="admin-table">{children}</table>
    </div>
  );
}
