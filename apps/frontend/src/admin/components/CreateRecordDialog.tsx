"use client";

import type { AdminCollection } from "@countrytopics/contracts";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { COLLECTION_TEXT } from "../collections";
import { FieldIdPrefix } from "../field-id-prefix";
import { CREATE_FORMS } from "../registry/create-forms";

// A related record made without leaving the editor (ADR 0014, phase 11),
// as Payload's panel makes one from a relationship field: the record's own
// editor in a dialog, which, once saved, chooses the record in the field.
// Each feature offers its own (registry/create-forms.ts); the editors load
// only when a dialog opens.

function Editor({
  collection,
  onCreated,
}: {
  collection: AdminCollection;
  onCreated: (id: string) => void;
}) {
  const Form = CREATE_FORMS[collection];
  return Form ? <Form onCreated={onCreated} /> : null;
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
