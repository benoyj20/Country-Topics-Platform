"use client";

import {
  adminPickerSearchParams,
  type RelatedRecord,
  recordOf,
} from "@countrytopics/contracts";
import { isAllowedLinkUrl } from "@countrytopics/domain";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as z from "zod";

import { RelationPicker } from "../components/RelationPicker";
import type { LinkFields } from "./body-nodes";

// The body's link form, as Payload's link drawer has it: a web address or
// email, or a topic or individual on this site, and whether it opens in a
// new tab.

type LinkKind = "custom" | "topics" | "individuals";

const KIND_LABELS: Record<LinkKind, string> = {
  custom: "A web page or email address",
  topics: "A topic",
  individuals: "An individual",
};

const Doc = z.object({ docs: z.array(z.looseObject({ id: z.string() })) });

/** The title of the record an existing internal link points to. */
function useLinkedTitle(
  kind: LinkKind,
  doc: RelatedRecord | null,
  setDoc: (doc: RelatedRecord) => void,
) {
  const id = doc?.title === null ? doc.id : null;
  useEffect(() => {
    if (kind === "custom" || !id) return;
    const controller = new AbortController();
    const params = adminPickerSearchParams(kind, "", {
      where: { id: { equals: id } },
    });
    fetch(`/api/${kind}?${params}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const [found] = Doc.parse(await response.json()).docs;
        if (found) setDoc(recordOf(kind, found));
      })
      // The link still shows its id; nothing else depends on the title.
      .catch(() => {});
    return () => controller.abort();
  }, [kind, id, setDoc]);
}

export function LinkDialog({
  initial,
  onSave,
  onRemove,
  onClose,
  onClosed,
}: {
  /** The link being changed, or null for a new one. */
  initial: LinkFields | null;
  onSave: (fields: LinkFields) => void;
  onRemove: () => void;
  onClose: () => void;
  /** After the dialog has closed, when the page can take the focus again. */
  onClosed: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const idPrefix = useId();
  const initialDoc = initial?.linkType === "internal" ? initial.doc : null;
  const [kind, setKind] = useState<LinkKind>(
    initialDoc?.relationTo === "topics" ||
      initialDoc?.relationTo === "individuals"
      ? initialDoc.relationTo
      : "custom",
  );
  const [url, setUrl] = useState(
    initial?.linkType === "custom" ? (initial.url ?? "") : "",
  );
  const [doc, setDoc] = useState<RelatedRecord | null>(
    initialDoc && typeof initialDoc.value === "string"
      ? { id: initialDoc.value, title: null }
      : null,
  );
  const [newTab, setNewTab] = useState(Boolean(initial?.newTab));
  const [error, setError] = useState<string | null>(null);
  useLinkedTitle(kind, doc, setDoc);

  // Opened as it mounts, closed as it unmounts.
  const closed = useRef(onClosed);
  useEffect(() => {
    const element = dialog.current;
    const afterClose = closed.current;
    element?.showModal();
    return () => {
      element?.close();
      afterClose();
    };
  }, []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React passes events up through portals: this submit must not also
    // submit the topic's form.
    event.stopPropagation();
    if (kind === "custom") {
      if (!isAllowedLinkUrl(url.trim())) {
        setError(
          "Enter a full link starting with https://, http://, or mailto:.",
        );
        return;
      }
      onSave({ linkType: "custom", newTab, url: url.trim() });
      return;
    }
    if (!doc) {
      setError(
        kind === "topics" ? "Choose the topic." : "Choose the individual.",
      );
      return;
    }
    onSave({
      linkType: "internal",
      newTab,
      doc: { relationTo: kind, value: doc.id },
    });
  }

  const errorId = `${idPrefix}-error`;
  // In a portal: the dialog's form cannot sit inside the topic's form.
  return createPortal(
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby={`${idPrefix}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form className="admin-stack" onSubmit={save} noValidate>
        <h2 id={`${idPrefix}-title`}>{initial ? "Edit link" : "Add a link"}</h2>
        <fieldset className="admin-choices">
          <legend>Link to</legend>
          {(Object.keys(KIND_LABELS) as LinkKind[]).map((value) => (
            <label key={value} className="admin-check">
              <input
                type="radio"
                name={`${idPrefix}-kind`}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setDoc(null);
                  setError(null);
                }}
              />
              {KIND_LABELS[value]}
            </label>
          ))}
        </fieldset>
        {kind === "custom" ? (
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-url`}>Link</label>
            <input
              id={`${idPrefix}-url`}
              className="admin-input"
              type="url"
              inputMode="url"
              autoFocus
              value={url}
              placeholder="https://"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
            />
          </div>
        ) : (
          <div className="admin-field">
            <label htmlFor={`${idPrefix}-doc`}>
              {kind === "topics" ? "Topic" : "Individual"}
            </label>
            <RelationPicker
              id={`${idPrefix}-doc`}
              collection={kind}
              value={doc ? [doc] : []}
              onChange={(chosen) => {
                setDoc(chosen.at(-1) ?? null);
                setError(null);
              }}
              toRecord={(match) => recordOf(kind, match)}
              invalid={Boolean(error)}
              describedBy={error ? errorId : undefined}
            />
          </div>
        )}
        <label className="admin-check">
          <input
            type="checkbox"
            checked={newTab}
            onChange={(event) => setNewTab(event.target.checked)}
          />
          Open in a new tab
        </label>
        {error && (
          <p id={errorId} className="admin-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-actions">
          <button type="submit" className="admin-button">
            {initial ? "Save link" : "Add link"}
          </button>
          {initial && (
            <button
              type="button"
              className="admin-button secondary"
              onClick={onRemove}
            >
              Remove link
            </button>
          )}
          <button
            type="button"
            className="admin-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
