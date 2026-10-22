import type { ReactNode } from "react";

import { describedBy } from "./field-ids";
import { moveRow } from "../form-state";

// An array field as the editors show it: a heading with what the array is
// for and the messages about it, then its rows, each in its own group with
// buttons to move or remove it, and a button to add one.

/** An array field: its rows, with the messages about the whole array. */
export function ArrayField({
  id,
  label,
  description,
  messages,
  nested = false,
  children,
}: {
  /** The array's key, such as `statements.0.sources`. */
  id: string;
  label: string;
  description?: string;
  messages?: readonly string[];
  /** Inside another array's row: a smaller heading. */
  nested?: boolean;
  children: ReactNode;
}) {
  const Heading = nested ? "h3" : "h2";
  return (
    <section
      id={id}
      tabIndex={-1}
      className={messages?.length ? "admin-array invalid" : "admin-array"}
      aria-labelledby={`${id}-heading`}
      aria-describedby={describedBy(id, {
        description,
        invalid: Boolean(messages?.length),
      })}
    >
      <Heading id={`${id}-heading`}>{label}</Heading>
      {description && (
        <p id={`${id}-description`} className="admin-muted">
          {description}
        </p>
      )}
      {messages?.length ? (
        <p id={`${id}-error`} className="admin-field-error">
          {messages.join(" ")}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * An array field's rows. Rows are keyed by their place: the inputs show
 * the row's values wherever it moves, though a picker's half-typed search
 * stays where it was.
 */
export function RowList<T>({
  name,
  rows,
  readOnly,
  max,
  onRows,
  onAdd,
  children,
}: {
  /** What one row is called, such as "Evidence". */
  name: string;
  rows: readonly T[];
  readOnly: boolean;
  /** The most rows the backend takes. */
  max?: number;
  /** Rows moved or removed: their numbers change. */
  onRows: (rows: T[]) => void;
  onAdd: () => void;
  children: (row: T, index: number) => ReactNode;
}) {
  const lower = name.toLowerCase();
  return (
    <div className="admin-rows">
      {rows.length === 0 && <p className="admin-muted">No {lower} rows yet.</p>}
      {rows.map((row, index) => (
        <fieldset key={index} className="admin-array-row">
          <legend>
            {name} {index + 1}
          </legend>
          {!readOnly && (
            <div className="admin-array-tools">
              <button
                type="button"
                className="admin-link-button"
                disabled={index === 0}
                aria-label={`Move ${lower} ${index + 1} up`}
                onClick={() => onRows(moveRow(rows, index, index - 1))}
              >
                Move up
              </button>
              <button
                type="button"
                className="admin-link-button"
                disabled={index === rows.length - 1}
                aria-label={`Move ${lower} ${index + 1} down`}
                onClick={() => onRows(moveRow(rows, index, index + 1))}
              >
                Move down
              </button>
              <button
                type="button"
                className="admin-link-button danger"
                aria-label={`Remove ${lower} ${index + 1}`}
                onClick={() => onRows(rows.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            </div>
          )}
          {children(row, index)}
        </fieldset>
      ))}
      {!readOnly && (max === undefined || rows.length < max) && (
        <button
          type="button"
          className="admin-button secondary"
          onClick={onAdd}
        >
          Add {lower}
        </button>
      )}
    </div>
  );
}
