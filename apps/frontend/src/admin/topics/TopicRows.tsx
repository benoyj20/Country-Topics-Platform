"use client";

import {
  fileOf,
  recordOf,
  referenceOf,
  type Refusal,
  type TopicCitationRow,
  type TopicEvidenceRow,
  type TopicPersonRow,
} from "@countrytopics/contracts";
import {
  CLAIM_STANCES,
  DOCUMENT_MIME_TYPES,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_NOTE_MAX_LENGTH,
  EVIDENCE_TITLE_MAX_LENGTH,
  type EvidenceKind,
  IMAGE_MIME_TYPES,
  LOCATOR_MAX_LENGTH,
  PASSAGE_MAX_LENGTH,
  PERSON_ROLE_LABELS,
  REFERENCE_CHECK_LABELS,
  STANCE_LABELS,
  TOPIC_PERSON_ROLES,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import type { ReactNode } from "react";

import { describedBy, Field } from "../components/Field";
import { RelationPicker } from "../components/RelationPicker";
import { safeHref } from "../safe-href";
import { moveRow } from "./form-state";
import { LinkArchiveStatus } from "./LinkArchiveStatus";
import { ROW_FIELDS, ROW_NAMES } from "./topic-text";

// The topic's rows: its individuals, its evidence, and the references it
// cites, each with the fields Payload's panel shows for it.

type RowProps<T> = {
  array: "people" | "evidence" | "references";
  index: number;
  row: T;
  onChange: (patch: Partial<T>) => void;
  refusal: Refusal | null;
  readOnly: boolean;
};

/** A row field's id, label, description, and messages. */
function rowField(
  array: string,
  index: number,
  field: string,
  refusal: Refusal | null,
) {
  const id = `${array}.${index}.${field}`;
  const text = ROW_FIELDS[array]?.[field];
  const messages = refusal?.fields[id];
  return {
    id,
    label: text?.label ?? field,
    description: text?.description,
    messages,
    aria: {
      "aria-invalid": messages?.length ? true : undefined,
      "aria-describedby": describedBy(id, {
        description: text?.description,
        invalid: Boolean(messages?.length),
      }),
    },
  };
}

export function PersonFields({
  array,
  index,
  row,
  onChange,
  refusal,
  readOnly,
}: RowProps<TopicPersonRow>) {
  const individual = rowField(array, index, "individual", refusal);
  const role = rowField(array, index, "role", refusal);
  return (
    <div className="admin-fields two">
      <Field {...individual} required>
        <RelationPicker
          id={individual.id}
          collection="individuals"
          value={row.individual ? [row.individual] : []}
          onChange={(chosen) => onChange({ individual: chosen.at(-1) ?? null })}
          toRecord={(match) => recordOf("individuals", match)}
          disabled={readOnly}
          invalid={Boolean(individual.messages?.length)}
          describedBy={individual.aria["aria-describedby"]}
        />
      </Field>
      <Field {...role} required>
        <select
          id={role.id}
          className="admin-input"
          value={row.role}
          disabled={readOnly}
          {...role.aria}
          onChange={(event) =>
            onChange({ role: event.target.value as TopicPersonRow["role"] })
          }
        >
          {TOPIC_PERSON_ROLES.map((value) => (
            <option key={value} value={value}>
              {PERSON_ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

const FILE_TYPES: Partial<Record<EvidenceKind, readonly string[]>> = {
  document: DOCUMENT_MIME_TYPES,
  image: IMAGE_MIME_TYPES,
};

export function EvidenceFields({
  array,
  index,
  row,
  onChange,
  refusal,
  readOnly,
}: RowProps<TopicEvidenceRow>) {
  const kind = rowField(array, index, "kind", refusal);
  const title = rowField(array, index, "title", refusal);
  const file = rowField(array, index, "file", refusal);
  const snippet = rowField(array, index, "snippet", refusal);
  const url = rowField(array, index, "url", refusal);
  const archiveUrl = rowField(array, index, "archiveUrl", refusal);
  const note = rowField(array, index, "note", refusal);
  const fileTypes = FILE_TYPES[row.kind];
  return (
    <>
      <div className="admin-fields two">
        <Field {...kind} required>
          <select
            id={kind.id}
            className="admin-input"
            value={row.kind}
            disabled={readOnly}
            {...kind.aria}
            onChange={(event) => {
              const next = event.target.value as EvidenceKind;
              // A file chosen for documents is not one for images.
              onChange(
                FILE_TYPES[next] === fileTypes
                  ? { kind: next }
                  : { kind: next, file: null },
              );
            }}
          >
            {EVIDENCE_KINDS.map((value) => (
              <option key={value} value={value}>
                {EVIDENCE_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field {...title} required={row.kind !== "snippet"}>
          <input
            id={title.id}
            className="admin-input"
            value={row.title}
            maxLength={EVIDENCE_TITLE_MAX_LENGTH}
            disabled={readOnly}
            {...title.aria}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>
      </div>
      {fileTypes && (
        <Field {...file} required>
          <RelationPicker
            id={file.id}
            collection="media"
            value={row.file ? [row.file] : []}
            onChange={(chosen) => onChange({ file: chosen.at(-1) ?? null })}
            toRecord={fileOf}
            extra={["filename", "mimeType", "url"]}
            where={{ mimeType: { in: [...fileTypes] } }}
            describe={(chosen) => {
              const href = safeHref(chosen.url);
              return href ? (
                <>
                  {" "}
                  <a href={href} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </>
              ) : null;
            }}
            disabled={readOnly}
            invalid={Boolean(file.messages?.length)}
            describedBy={file.aria["aria-describedby"]}
          />
        </Field>
      )}
      {row.kind === "snippet" && (
        <Field {...snippet} required>
          <RelationPicker
            id={snippet.id}
            collection="snippets"
            value={row.snippet ? [row.snippet] : []}
            onChange={(chosen) => onChange({ snippet: chosen.at(-1) ?? null })}
            toRecord={(match) => recordOf("snippets", match)}
            disabled={readOnly}
            invalid={Boolean(snippet.messages?.length)}
            describedBy={snippet.aria["aria-describedby"]}
          />
        </Field>
      )}
      {row.kind === "link" && (
        <>
          <Field {...url} required>
            <input
              id={url.id}
              className="admin-input"
              type="url"
              inputMode="url"
              value={row.url}
              maxLength={URL_MAX_LENGTH}
              disabled={readOnly}
              {...url.aria}
              onChange={(event) => onChange({ url: event.target.value })}
            />
            <LinkArchiveStatus url={row.url} />
          </Field>
          <Field {...archiveUrl}>
            <input
              id={archiveUrl.id}
              className="admin-input"
              type="url"
              inputMode="url"
              value={row.archiveUrl}
              maxLength={URL_MAX_LENGTH}
              disabled={readOnly}
              {...archiveUrl.aria}
              onChange={(event) => onChange({ archiveUrl: event.target.value })}
            />
          </Field>
        </>
      )}
      <Field {...note}>
        <textarea
          id={note.id}
          className="admin-input"
          rows={2}
          value={row.note}
          maxLength={EVIDENCE_NOTE_MAX_LENGTH}
          disabled={readOnly}
          {...note.aria}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </Field>
    </>
  );
}

export function CitationFields({
  array,
  index,
  row,
  onChange,
  refusal,
  readOnly,
}: RowProps<TopicCitationRow>) {
  const reference = rowField(array, index, "reference", refusal);
  const stance = rowField(array, index, "stance", refusal);
  const passage = rowField(array, index, "passage", refusal);
  const locator = rowField(array, index, "locator", refusal);
  return (
    <>
      <div className="admin-fields two">
        <Field {...reference} required>
          <RelationPicker
            id={reference.id}
            collection="references"
            value={row.reference ? [row.reference] : []}
            onChange={(chosen) =>
              onChange({ reference: chosen.at(-1) ?? null })
            }
            toRecord={referenceOf}
            extra={["checkStatus"]}
            describe={(chosen) =>
              chosen.checkStatus ? (
                <span
                  className={
                    chosen.checkStatus === "resolved"
                      ? "admin-badge good"
                      : "admin-badge"
                  }
                >
                  {REFERENCE_CHECK_LABELS[chosen.checkStatus]}
                </span>
              ) : null
            }
            disabled={readOnly}
            invalid={Boolean(reference.messages?.length)}
            describedBy={reference.aria["aria-describedby"]}
          />
        </Field>
        <Field {...stance} required>
          <select
            id={stance.id}
            className="admin-input"
            value={row.stance}
            disabled={readOnly}
            {...stance.aria}
            onChange={(event) =>
              onChange({
                stance: event.target.value as TopicCitationRow["stance"],
              })
            }
          >
            {CLAIM_STANCES.map((value) => (
              <option key={value} value={value}>
                {STANCE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field {...passage} required>
        <textarea
          id={passage.id}
          className="admin-input"
          rows={3}
          value={row.passage}
          maxLength={PASSAGE_MAX_LENGTH}
          disabled={readOnly}
          {...passage.aria}
          onChange={(event) => onChange({ passage: event.target.value })}
        />
      </Field>
      <Field {...locator}>
        <input
          id={locator.id}
          className="admin-input"
          value={row.locator}
          maxLength={LOCATOR_MAX_LENGTH}
          disabled={readOnly}
          {...locator.aria}
          onChange={(event) => onChange({ locator: event.target.value })}
        />
      </Field>
    </>
  );
}

/**
 * An array field's rows, each in its own group with buttons to move or
 * remove it, and a button to add one. Rows are keyed by their place: the
 * inputs show the row's values wherever it moves, though a picker's
 * half-typed search stays where it was.
 */
export function RowList<T>({
  array,
  rows,
  readOnly,
  onRows,
  onAdd,
  children,
}: {
  array: "people" | "evidence" | "references";
  rows: readonly T[];
  readOnly: boolean;
  /** Rows moved or removed: their numbers change. */
  onRows: (rows: T[]) => void;
  onAdd: () => void;
  children: (row: T, index: number) => ReactNode;
}) {
  const name = ROW_NAMES[array] ?? array;
  return (
    <div className="admin-rows">
      {rows.length === 0 && (
        <p className="admin-muted">No {name.toLowerCase()} rows yet.</p>
      )}
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
                aria-label={`Move ${name.toLowerCase()} ${index + 1} up`}
                onClick={() => onRows(moveRow(rows, index, index - 1))}
              >
                Move up
              </button>
              <button
                type="button"
                className="admin-link-button"
                disabled={index === rows.length - 1}
                aria-label={`Move ${name.toLowerCase()} ${index + 1} down`}
                onClick={() => onRows(moveRow(rows, index, index + 1))}
              >
                Move down
              </button>
              <button
                type="button"
                className="admin-link-button danger"
                aria-label={`Remove ${name.toLowerCase()} ${index + 1}`}
                onClick={() => onRows(rows.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            </div>
          )}
          {children(row, index)}
        </fieldset>
      ))}
      {!readOnly && (
        <button
          type="button"
          className="admin-button secondary"
          onClick={onAdd}
        >
          Add {name.toLowerCase()}
        </button>
      )}
    </div>
  );
}
