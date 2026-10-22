"use client";

import {
  type EvidenceRow,
  fileOf,
  recordOf,
  referenceOf,
  type Refusal,
  type RelatedReference,
  type SourceRow,
} from "@countrytopics/contracts";
import {
  DOCUMENT_MIME_TYPES,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_NOTE_MAX_LENGTH,
  EVIDENCE_TITLE_MAX_LENGTH,
  type EvidenceKind,
  IMAGE_MIME_TYPES,
  LOCATOR_MAX_LENGTH,
  PASSAGE_MAX_LENGTH,
  REFERENCE_CHECK_LABELS,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import type { ReactNode } from "react";

import { fieldProps, type FieldTexts, pickerAria } from "../field-text";
import { safeHref } from "../safe-href";
import { Field } from "./Field";
import { LinkArchiveStatus } from "./LinkArchiveStatus";
import { RelationPicker } from "./RelationPicker";

// The fields of an evidence row and of a source row, as Payload's panel
// shows them (apps/web/src/collections/evidence-field.ts): in a topic's
// rows and in each statement on an individual's profile.

export type RowProps<T> = {
  /** The form's texts, which name this row's fields. */
  texts: FieldTexts;
  /** The row's key, such as `evidence.0` or `statements.1.evidence.0`. */
  at: string;
  row: T;
  onChange: (patch: Partial<T>) => void;
  refusal: Refusal | null;
  readOnly: boolean;
};

const FILE_TYPES: Partial<Record<EvidenceKind, readonly string[]>> = {
  document: DOCUMENT_MIME_TYPES,
  image: IMAGE_MIME_TYPES,
};

/** A chosen file, with a link to open it. */
export function openFile(file: { url: string | null }): ReactNode {
  const href = safeHref(file.url);
  return href ? (
    <>
      {" "}
      <a href={href} target="_blank" rel="noreferrer">
        Open
      </a>
    </>
  ) : null;
}

export function EvidenceFields({
  texts,
  at,
  row,
  onChange,
  refusal,
  readOnly,
}: RowProps<EvidenceRow>) {
  const field = (name: string) => fieldProps(texts, `${at}.${name}`, refusal);
  const kind = field("kind");
  const title = field("title");
  const file = field("file");
  const snippet = field("snippet");
  const url = field("url");
  const archiveUrl = field("archiveUrl");
  const note = field("note");
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
            describe={openFile}
            disabled={readOnly}
            {...pickerAria(file)}
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
            {...pickerAria(snippet)}
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

/** A reference's check, beside it where it is chosen. */
export function referenceCheck(reference: RelatedReference): ReactNode {
  const status = reference.checkStatus;
  return status ? (
    <span
      className={status === "resolved" ? "admin-badge good" : "admin-badge"}
    >
      {REFERENCE_CHECK_LABELS[status]}
    </span>
  ) : null;
}

/**
 * A source row's fields; `beside` goes next to the reference, such as a
 * topic's stance.
 */
export function SourceFields({
  texts,
  at,
  row,
  onChange,
  refusal,
  readOnly,
  beside,
}: RowProps<SourceRow> & { beside?: ReactNode }) {
  const field = (name: string) => fieldProps(texts, `${at}.${name}`, refusal);
  const reference = field("reference");
  const passage = field("passage");
  const locator = field("locator");
  const picker = (
    <Field {...reference} required>
      <RelationPicker
        id={reference.id}
        collection="references"
        value={row.reference ? [row.reference] : []}
        onChange={(chosen) => onChange({ reference: chosen.at(-1) ?? null })}
        toRecord={referenceOf}
        extra={["checkStatus"]}
        describe={referenceCheck}
        disabled={readOnly}
        {...pickerAria(reference)}
      />
    </Field>
  );
  return (
    <>
      {beside ? (
        <div className="admin-fields two">
          {picker}
          {beside}
        </div>
      ) : (
        picker
      )}
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
