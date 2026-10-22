"use client";

import {
  type AdminCollection,
  EMPTY_INDIVIDUAL,
  EMPTY_MEDIA,
  EMPTY_REFERENCE,
  EMPTY_SNIPPET,
  EMPTY_TERM,
} from "@countrytopics/contracts";
import dynamic from "next/dynamic";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { COLLECTION_TEXT } from "../collections";
import { FieldIdPrefix } from "../field-id-prefix";

// A related record made without leaving the editor (ADR 0014, phase 11),
// as Payload's panel makes one from a relationship field: the record's own
// editor in a dialog, which, once saved, chooses the record in the field.
// The editors load only when a dialog opens.

const loading = () => <p className="admin-muted">Loading the editor…</p>;
const TermForm = dynamic(
  () => import("../records/TaxonomyForms").then((module) => module.TermForm),
  { loading },
);
const ReferenceForm = dynamic(
  () =>
    import("../records/ReferenceForm").then((module) => module.ReferenceForm),
  { loading },
);
const IndividualForm = dynamic(
  () =>
    import("../records/IndividualForm").then((module) => module.IndividualForm),
  { loading },
);
const MediaForm = dynamic(
  () => import("../records/MediaForm").then((module) => module.MediaForm),
  { loading },
);
const SnippetForm = dynamic(
  () => import("../records/SnippetForm").then((module) => module.SnippetForm),
  { loading },
);

/** The collections whose records a field can make: those made in the admin. */
export const CREATED_FROM_FIELDS: ReadonlySet<AdminCollection> = new Set([
  "references",
  "individuals",
  "categories",
  "tags",
  "media",
  "snippets",
]);

function Editor({
  collection,
  onCreated,
}: {
  collection: AdminCollection;
  onCreated: (id: string) => void;
}) {
  switch (collection) {
    case "categories":
    case "tags":
      return (
        <TermForm
          collection={collection}
          id={null}
          values={EMPTY_TERM}
          status={null}
          canEdit
          onCreated={onCreated}
        />
      );
    case "references":
      return (
        <ReferenceForm
          id={null}
          values={EMPTY_REFERENCE}
          status={null}
          canEdit
          onCreated={onCreated}
        />
      );
    case "individuals":
      return (
        <IndividualForm
          id={null}
          values={EMPTY_INDIVIDUAL}
          status={null}
          canEdit
          onCreated={onCreated}
        />
      );
    case "media":
      return (
        <MediaForm
          id={null}
          values={EMPTY_MEDIA}
          file={null}
          canEdit
          onCreated={onCreated}
        />
      );
    case "snippets":
      return (
        <SnippetForm
          id={null}
          values={EMPTY_SNIPPET}
          status={null}
          canEdit
          onCreated={onCreated}
        />
      );
    default:
      return null;
  }
}

export function CreateRecordDialog({
  collection,
  onCreated,
  onClose,
}: {
  collection: AdminCollection;
  /** The new record's id, once saved. */
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const singular = COLLECTION_TEXT[collection].singular.toLowerCase();

  // Opened as it mounts, closed as it unmounts.
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function close() {
    if (window.confirm(`Close without creating the ${singular}?`)) onClose();
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="admin-dialog wide"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="admin-stack">
        <div className="admin-title-row">
          <h2 id={`${id}-title`}>New {singular}</h2>
          <button
            type="button"
            className="admin-button secondary"
            onClick={close}
          >
            Close
          </button>
        </div>
        <p className="admin-muted">
          Once created, it is chosen in the field you came from.
        </p>
        {/* Its fields' ids are its own, not those of the editor behind it. */}
        <FieldIdPrefix value={`${id}-`}>
          <Editor collection={collection} onCreated={onCreated} />
        </FieldIdPrefix>
      </div>
    </dialog>,
    document.body,
  );
}
