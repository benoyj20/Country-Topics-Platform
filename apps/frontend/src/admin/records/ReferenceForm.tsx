"use client";

import {
  editorReference,
  referenceAfterLookup,
  referenceFieldOf,
  referenceLookupSchema,
  referenceLookupSearchParams,
  referenceSaveBody,
  referenceSearchParams,
  type ReferenceStatus,
  type ReferenceValues,
  storedReferenceSchema,
} from "@countrytopics/contracts";
import {
  DOI_MAX_LENGTH,
  REFERENCE_AUTHORS_MAX_LENGTH,
  REFERENCE_CHECK_LABELS,
  REFERENCE_KIND_LABELS,
  REFERENCE_KINDS,
  REFERENCE_SOURCE_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  type ReferenceCheckStatus,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import { useState } from "react";

import { formatDateTime } from "@/format";

import type { FieldTexts } from "../field-text";
import { deleteRecord, saveRecord } from "../write";
import { SelectInput, TextArea, TextInput } from "./inputs";
import { type FormApi, RecordForm } from "./RecordForm";

// The reference editor, as Payload's panel edits a reference
// (apps/web/src/collections/References.ts): its DOI, ISBN, or link, which
// "Look up" fills the other fields from, and the worker's check of them,
// which every save asks for again while the reference is not confirmed.

const TEXTS: FieldTexts = {
  doi: { label: "DOI" },
  isbn: { label: "ISBN" },
  url: {
    label: "Link",
    description:
      "Where to read it: the publisher's page or the report itself. Needed when there is no DOI or ISBN.",
  },
  kind: { label: "Kind" },
  publishedDate: { label: "Published" },
  title: { label: "Title" },
  authors: { label: "Authors", description: "One per line, as printed." },
  containerTitle: { label: "Journal, book, or website" },
  publisher: { label: "Publisher" },
};

const ORDER = Object.keys(TEXTS);

const KIND_OPTIONS = REFERENCE_KINDS.map((value) => ({
  value,
  label: REFERENCE_KIND_LABELS[value],
}));

/** What each check means for the topics that cite the reference. */
const CHECK_TEXT: Record<ReferenceCheckStatus, string> = {
  pending: "The worker checks the DOI, ISBN, and link after each save.",
  resolved: "Topics may cite it when they are published.",
  not_found:
    "Fix the DOI, ISBN, or link and save again; topics cannot be published citing it until it is confirmed.",
  failed: "The check could not finish. Save again to retry.",
};

export function ReferenceForm({
  id,
  values,
  status,
  canEdit,
  notice,
}: {
  id: string | null;
  values: ReferenceValues;
  status: ReferenceStatus | null;
  canEdit: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="reference"
      listHref="/admin/collections/references"
      recordHref={(saved) => `/admin/collections/references/${saved}`}
      canEdit={canEdit}
      canDelete
      readOnlyNotice="You can read this reference. Only admins edit references."
      notice={notice}
      texts={TEXTS}
      order={ORDER}
      saveBody={referenceSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "references",
            id: saving,
            query: referenceSearchParams(),
            body: referenceSaveBody(sent),
            fieldOf: referenceFieldOf,
            schema: storedReferenceSchema,
          },
          editorReference,
        )
      }
      remove={(removing) =>
        deleteRecord("references", removing, referenceFieldOf)
      }
      side={(_, current) => current && <ReferenceCheck status={current} />}
    >
      {(form) => (
        <>
          <div className="admin-fields two">
            <TextInput form={form} name="doi" maxLength={DOI_MAX_LENGTH} />
            <TextInput form={form} name="isbn" />
          </div>
          {!form.readOnly && <LookUp form={form} />}
          <TextInput
            form={form}
            name="url"
            type="url"
            maxLength={URL_MAX_LENGTH}
          />
          <div className="admin-fields two">
            <SelectInput
              form={form}
              name="kind"
              options={KIND_OPTIONS}
              required
            />
            <TextInput form={form} name="publishedDate" maxLength={10} />
          </div>
          <TextInput
            form={form}
            name="title"
            maxLength={REFERENCE_TITLE_MAX_LENGTH}
            required
            large
          />
          <TextArea
            form={form}
            name="authors"
            maxLength={REFERENCE_AUTHORS_MAX_LENGTH}
            rows={4}
          />
          <div className="admin-fields two">
            <TextInput
              form={form}
              name="containerTitle"
              maxLength={REFERENCE_SOURCE_MAX_LENGTH}
            />
            <TextInput
              form={form}
              name="publisher"
              maxLength={REFERENCE_SOURCE_MAX_LENGTH}
            />
          </div>
        </>
      )}
    </RecordForm>
  );
}

type Message = { good: boolean; text: string };

/**
 * "Look up": fills the reference's empty fields from the record Crossref,
 * the DOI system, or Open Library holds for its DOI or ISBN, never
 * replacing what the admin typed.
 */
function LookUp({ form }: { form: FormApi<ReferenceValues> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const params = referenceLookupSearchParams(form.values);

  async function lookUp() {
    if (!params) return;
    const by = params.has("doi") ? "DOI" : "ISBN";
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/references/lookup?${params}`, {
        credentials: "same-origin",
      });
      const answer = referenceLookupSchema.parse(await response.json());
      if ("error" in answer) {
        setMessage({ good: false, text: answer.error });
        return;
      }
      if (!answer.found) {
        setMessage({
          good: false,
          text: `No record was found for this ${by}. Check it for typos.`,
        });
        return;
      }
      // Filled into the form as it is now: typing went on while it ran.
      const { filled } = referenceAfterLookup(form.values, answer);
      form.update(
        (current) => referenceAfterLookup(current, answer).values,
        [...filled, by.toLowerCase(), "kind"],
      );
      setMessage({
        good: true,
        text:
          filled.length > 0
            ? `Found in ${answer.metadata.source}; empty fields were filled in. Check them before saving.`
            : `Found in ${answer.metadata.source}. Fields you had filled in were left as they are.`,
      });
    } catch {
      setMessage({
        good: false,
        text: "The lookup failed. Try again, or fill in the details by hand.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-field">
      <div>
        <button
          type="button"
          className="admin-button secondary"
          disabled={busy || !params}
          onClick={() => void lookUp()}
        >
          {busy ? "Looking up…" : "Look up DOI or ISBN"}
        </button>
      </div>
      {message && (
        <p
          className={message.good ? "admin-notice good" : "admin-notice error"}
          role={message.good ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** What the worker found when it checked the DOI, ISBN, and link. */
function ReferenceCheck({ status }: { status: ReferenceStatus }) {
  const good = status.checkStatus === "resolved";
  return (
    <section className="admin-card" aria-labelledby="reference-check">
      <h2 id="reference-check">Check</h2>
      <p>
        <span className={good ? "admin-badge good" : "admin-badge"}>
          {REFERENCE_CHECK_LABELS[status.checkStatus]}
        </span>
      </p>
      {status.checkMessage && <p>{status.checkMessage}</p>}
      <p className="admin-muted">{CHECK_TEXT[status.checkStatus]}</p>
      {status.checkedAt && (
        <p className="admin-muted">
          Checked {formatDateTime(status.checkedAt)}.
        </p>
      )}
    </section>
  );
}
