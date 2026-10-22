"use client";

import {
  editorTopic,
  emptyCitationRow,
  emptyEvidenceRow,
  emptyPersonRow,
  recordOf,
  type Refusal,
  type TopicStatus,
  topicPublishChecks,
  type TopicValues,
  valuesAfterSave,
} from "@countrytopics/contracts";
import {
  CHANGE_NOTE_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  TOPIC_STATE_LABELS,
  TOPIC_SUMMARY_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
} from "@countrytopics/domain";
import type { LexicalEditor, SerializedEditorState } from "lexical";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useRef, useState } from "react";

import { formatDateTime } from "@/format";

import { EvidenceFields } from "../components/EvidenceFields";
import { CheckField, Field } from "../components/Field";
import { RefusalSummary } from "../components/RefusalSummary";
import { RelationPicker } from "../components/RelationPicker";
import { ArrayField, RowList } from "../components/Rows";
import {
  useArrivedNotice,
  useLeaveGuard,
  useRefusalFocus,
  useSaveShortcut,
} from "../editor-guards";
import { arrayProps, fieldProps, pickerAria, rowNameAt } from "../field-text";
import { recordName } from "../record-name";
import { clearMessages, savedForm, valuesAfterAnswer } from "./form-state";
import { deleteTopic, saveTopic } from "./save";
import { fieldName, TOPIC_TEXTS } from "./topic-text";
import { CitationFields, PersonFields } from "./TopicRows";

// A topic's editor (ADR 0014, phase 8): every field Payload's panel shows,
// saved as a draft or published through Payload's REST API. The backend's
// hooks keep the workflow (states, change notes, the change log, versions)
// and refuse what may not be published; each refusal is shown beside the
// field it names.

const BodyEditor = dynamic(() => import("../editor/BodyEditor"), {
  ssr: false,
  loading: () => <p className="admin-muted">Loading the editor…</p>,
});

/** The form's fields in order, for listing a refusal's messages. */
const FIELD_ORDER = [
  "title",
  "summary",
  "body",
  "countries",
  "category",
  "tags",
  "people",
  "evidence",
  "references",
  "changeNote",
  "readyForReview",
  "archived",
  "slug",
];

type Outcome =
  | { kind: "saved"; publish: boolean; slug: string | null }
  | { kind: "refused"; publish: boolean | null; refusal: Refusal };

export type TopicFormProps = {
  /** Null for a topic not yet saved. */
  id: string | null;
  values: TopicValues;
  status: TopicStatus | null;
  /** Only admins edit topics; others read the form. */
  canEdit: boolean;
  /** Shown once, after the save that led here. */
  notice?: string;
  /** The topic's change log, beside the form. */
  changeLog?: ReactNode;
};

function stateText(status: TopicStatus | null): string {
  if (!status) return "New topic, not saved yet";
  const state = TOPIC_STATE_LABELS[status.state];
  if (status.firstPublishedAt && status.latest === "draft") {
    return `${state}, with unpublished changes`;
  }
  return state;
}

export function TopicForm({
  id,
  values: loaded,
  status: loadedStatus,
  canEdit,
  notice: arrivedNotice,
  changeLog,
}: TopicFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(loaded);
  const [status, setStatus] = useState(loadedStatus);
  // After a save, the page is read again (router.refresh): its status has
  // the names a save's answer leaves out, such as who last edited.
  const [shownStatus, setShownStatus] = useState(loadedStatus);
  if (loadedStatus !== shownStatus) {
    setShownStatus(loadedStatus);
    if (
      loadedStatus &&
      (!status || loadedStatus.updatedAt >= status.updatedAt)
    ) {
      setStatus(loadedStatus);
    }
  }
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState(arrivedNotice ?? null);
  const [working, setWorking] = useState<"draft" | "publish" | "delete" | null>(
    null,
  );
  // Set while a save or delete runs, and for good once a new topic is
  // created and the page moves to it: state would let a second click in.
  const busy = useRef(false);
  // The body is read from the editor when saving, not on every keystroke;
  // its edits are counted without drawing the form again.
  const editorRef = useRef<LexicalEditor | null>(null);
  const bodyEdits = useRef(0);
  const [bodyChanged, setBodyChanged] = useState(false);
  const [savedValues, setSavedValues] = useState(() => savedForm(loaded));
  const [summaryRef, refused] = useRefusalFocus();
  const readOnly = !canEdit;
  const refusal = outcome?.kind === "refused" ? outcome.refusal : null;
  const dirty = !readOnly && (bodyChanged || savedForm(values) !== savedValues);

  useArrivedNotice(arrivedNotice);
  useLeaveGuard(dirty);

  /** Changes a field; a whole array's rows may have moved. */
  function change<K extends keyof TopicValues>(key: K, value: TopicValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    clear(key, { rows: Array.isArray(value) });
  }

  function clear(key: string, options?: { rows?: boolean }) {
    setOutcome((current) => {
      if (current?.kind !== "refused") return current;
      const refusal = clearMessages(current.refusal, key, options);
      // Unchanged, so the form is not drawn again for nothing.
      const same =
        Object.keys(refusal.fields).length ===
        Object.keys(current.refusal.fields).length;
      return same ? current : { ...current, refusal };
    });
  }

  function changeRow<K extends "people" | "evidence" | "references">(
    array: K,
    index: number,
    patch: Partial<TopicValues[K][number]>,
  ) {
    setValues((current) => ({
      ...current,
      [array]: current[array].map((row, at) =>
        at === index ? { ...row, ...patch } : row,
      ),
    }));
    for (const field of Object.keys(patch)) clear(`${array}.${index}.${field}`);
    clear(array);
  }

  function refuse(publish: boolean | null, refusal: Refusal) {
    setOutcome({ kind: "refused", publish, refusal });
    refused();
  }

  async function save(publish: boolean) {
    if (busy.current || readOnly) return;
    setNotice(null);
    const body = editorRef.current
      ? editorRef.current.getEditorState().toJSON()
      : values.body;
    const sent = { ...values, body };
    // What a publish needs, checked before sending, as Payload's panel does.
    const missing = publish ? topicPublishChecks(sent) : {};
    if (Object.keys(missing).length > 0) {
      refuse(publish, { fields: missing, general: [] });
      return;
    }
    busy.current = true;
    setWorking(publish ? "publish" : "draft");
    const edits = bodyEdits.current;
    let leaving = false;
    try {
      const answer = await saveTopic(id, sent, publish);
      if (!answer.ok) {
        refuse(publish, answer.refusal);
        return;
      }
      const doc = answer.result;
      if (!id) {
        leaving = true;
        router.replace(
          `/admin/collections/topics/${doc.id}?saved=${publish ? "published" : "draft"}`,
        );
        return;
      }
      const stored = valuesAfterSave(doc, sent);
      setValues((current) => valuesAfterAnswer(current, sent, stored));
      setSavedValues(savedForm(stored));
      setBodyChanged(bodyEdits.current !== edits);
      setStatus((shown) => {
        const next = editorTopic(doc, body).status;
        // The answer names who edited by id only; the form knew them.
        return next.lastEditedBy?.id === shown?.lastEditedBy?.id
          ? { ...next, lastEditedBy: shown?.lastEditedBy ?? null }
          : next;
      });
      setOutcome({ kind: "saved", publish, slug: doc.slug ?? null });
      // The change log, the history, and who edited, beside the form.
      router.refresh();
    } finally {
      if (!leaving) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  async function remove() {
    if (!id || busy.current) return;
    if (
      !window.confirm(
        "Delete this topic? It was never published, and it cannot be brought back.",
      )
    ) {
      return;
    }
    busy.current = true;
    setWorking("delete");
    let leaving = false;
    try {
      const answer = await deleteTopic(id);
      if (!answer.ok) {
        refuse(null, answer.refusal);
        return;
      }
      // Nothing is left to lose.
      leaving = true;
      setSavedValues(savedForm(values));
      setBodyChanged(false);
      router.push("/admin/collections/topics");
    } finally {
      if (!leaving) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  // Ctrl+S saves a draft, as in Payload's panel.
  useSaveShortcut(() => void save(false), !readOnly);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  const field = (key: string) => fieldProps(TOPIC_TEXTS, key, refusal);
  const aria = (key: string) => field(key).aria;
  const array = (key: string) => arrayProps(field(key));
  const published = Boolean(status?.firstPublishedAt);

  return (
    <form className="record-editor" onSubmit={submit} noValidate>
      <div className="record-editor-bar">
        <p className="record-editor-state">
          <span>{stateText(status)}</span>
          {dirty && <span className="admin-badge">Unsaved changes</span>}
        </p>
        {!readOnly && (
          <div className="admin-actions">
            {id && !published && (
              <button
                type="button"
                className="admin-button secondary danger"
                disabled={working !== null}
                onClick={() => void remove()}
              >
                {working === "delete" ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="submit"
              className="admin-button secondary"
              disabled={working !== null}
            >
              {working === "draft" ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="admin-button"
              disabled={working !== null}
              onClick={() => void save(true)}
            >
              {working === "publish"
                ? "Publishing…"
                : published
                  ? "Publish changes"
                  : "Publish"}
            </button>
          </div>
        )}
      </div>

      {readOnly && (
        <p className="admin-notice">
          You can read this topic. Only admins edit topics.
        </p>
      )}
      {notice && (
        <p className="admin-notice good" role="status">
          {notice}
        </p>
      )}
      {outcome?.kind === "saved" && (
        <p className="admin-notice good" role="status">
          {outcome.publish ? "Published." : "Draft saved."}{" "}
          {outcome.publish && outcome.slug && (
            <a
              href={`/topics/${outcome.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View it on the site
            </a>
          )}
        </p>
      )}
      {refusal && (
        <RefusalSummary
          ref={summaryRef}
          heading={
            outcome?.kind === "refused" && outcome.publish === true
              ? "Not published"
              : outcome?.kind === "refused" && outcome.publish === null
                ? "Not deleted"
                : "Not saved"
          }
          refusal={refusal}
          order={FIELD_ORDER}
          fieldName={fieldName}
        />
      )}

      <p className="admin-muted">
        <span aria-hidden="true">*</span> Needed to publish.
      </p>
      <div className="record-editor-columns">
        <div className="record-editor-main">
          <Field {...field("title")} required>
            <input
              id="title"
              className="admin-input large"
              value={values.title}
              maxLength={TOPIC_TITLE_MAX_LENGTH}
              disabled={readOnly}
              {...aria("title")}
              onChange={(event) => change("title", event.target.value)}
            />
          </Field>
          <Field {...field("summary")} required>
            <textarea
              id="summary"
              className="admin-input"
              rows={3}
              value={values.summary}
              maxLength={TOPIC_SUMMARY_MAX_LENGTH}
              disabled={readOnly}
              {...aria("summary")}
              onChange={(event) => change("summary", event.target.value)}
            />
          </Field>
          <Field {...field("body")} required>
            <BodyEditor
              initial={(values.body as SerializedEditorState | null) ?? null}
              editorRef={editorRef}
              onChange={() => {
                bodyEdits.current += 1;
                setBodyChanged(true);
                clear("body");
              }}
              readOnly={readOnly}
              invalid={Boolean(field("body").messages?.length)}
              describedBy={aria("body")["aria-describedby"]}
            />
          </Field>
          <div className="admin-fields two">
            <Field {...field("countries")} required>
              <RelationPicker
                id="countries"
                collection="countries"
                multiple
                value={values.countries}
                onChange={(chosen) => change("countries", chosen)}
                toRecord={(match) => recordOf("countries", match)}
                disabled={readOnly}
                {...pickerAria(field("countries"))}
              />
            </Field>
            <Field {...field("category")}>
              <RelationPicker
                id="category"
                collection="categories"
                value={values.category ? [values.category] : []}
                onChange={(chosen) => change("category", chosen.at(-1) ?? null)}
                toRecord={(match) => recordOf("categories", match)}
                disabled={readOnly}
                {...pickerAria(field("category"))}
              />
            </Field>
          </div>
          <Field {...field("tags")}>
            <RelationPicker
              id="tags"
              collection="tags"
              multiple
              value={values.tags}
              onChange={(chosen) => change("tags", chosen)}
              toRecord={(match) => recordOf("tags", match)}
              disabled={readOnly}
              {...pickerAria(field("tags"))}
            />
          </Field>

          <ArrayField {...array("people")}>
            <RowList
              name={rowNameAt(TOPIC_TEXTS, "people")}
              rows={values.people}
              readOnly={readOnly}
              onRows={(rows) => change("people", rows)}
              onAdd={() =>
                change("people", [...values.people, emptyPersonRow()])
              }
            >
              {(row, index) => (
                <PersonFields
                  texts={TOPIC_TEXTS}
                  at={`people.${index}`}
                  row={row}
                  refusal={refusal}
                  readOnly={readOnly}
                  onChange={(patch) => changeRow("people", index, patch)}
                />
              )}
            </RowList>
          </ArrayField>
          <ArrayField {...array("evidence")}>
            <RowList
              name={rowNameAt(TOPIC_TEXTS, "evidence")}
              rows={values.evidence}
              readOnly={readOnly}
              onRows={(rows) => change("evidence", rows)}
              onAdd={() =>
                change("evidence", [...values.evidence, emptyEvidenceRow()])
              }
            >
              {(row, index) => (
                <EvidenceFields
                  texts={TOPIC_TEXTS}
                  at={`evidence.${index}`}
                  row={row}
                  refusal={refusal}
                  readOnly={readOnly}
                  onChange={(patch) => changeRow("evidence", index, patch)}
                />
              )}
            </RowList>
          </ArrayField>
          <ArrayField {...array("references")}>
            <RowList
              name={rowNameAt(TOPIC_TEXTS, "references")}
              rows={values.references}
              readOnly={readOnly}
              onRows={(rows) => change("references", rows)}
              onAdd={() =>
                change("references", [...values.references, emptyCitationRow()])
              }
            >
              {(row, index) => (
                <CitationFields
                  texts={TOPIC_TEXTS}
                  at={`references.${index}`}
                  row={row}
                  refusal={refusal}
                  readOnly={readOnly}
                  onChange={(patch) => changeRow("references", index, patch)}
                />
              )}
            </RowList>
          </ArrayField>
        </div>

        <aside className="record-editor-side" aria-label="Publishing">
          {!readOnly && (
            <Field {...field("changeNote")} required={published}>
              <textarea
                id="changeNote"
                className="admin-input"
                rows={3}
                value={values.changeNote}
                maxLength={CHANGE_NOTE_MAX_LENGTH}
                {...aria("changeNote")}
                onChange={(event) => change("changeNote", event.target.value)}
              />
            </Field>
          )}
          <CheckField
            {...field("readyForReview")}
            checked={values.readyForReview}
            disabled={readOnly}
            onChange={(checked) => change("readyForReview", checked)}
          />
          <CheckField
            {...field("archived")}
            checked={values.archived}
            disabled={readOnly}
            onChange={(checked) => change("archived", checked)}
          />
          <Field {...field("slug")}>
            <input
              id="slug"
              className="admin-input"
              value={values.slug}
              maxLength={SLUG_MAX_LENGTH}
              disabled={readOnly}
              {...aria("slug")}
              onChange={(event) => change("slug", event.target.value)}
            />
          </Field>
          {status && (
            <TopicDetails id={id} status={status} slug={values.slug} />
          )}
          {changeLog}
        </aside>
      </div>
    </form>
  );
}

function TopicDetails({
  id,
  status,
  slug,
}: {
  id: string | null;
  status: TopicStatus;
  slug: string;
}) {
  const rows: [string, ReactNode][] = [
    ["State", TOPIC_STATE_LABELS[status.state]],
    [
      "First published",
      status.firstPublishedAt
        ? formatDateTime(status.firstPublishedAt)
        : "Never",
    ],
    [
      "Last published",
      status.lastPublishedAt ? formatDateTime(status.lastPublishedAt) : "Never",
    ],
    [
      "Last edited by",
      status.lastEditedBy ? recordName(status.lastEditedBy) : "Nobody yet",
    ],
    ["Created", formatDateTime(status.createdAt)],
    ["Updated", formatDateTime(status.updatedAt)],
  ];
  return (
    <section className="admin-card" aria-labelledby="topic-details">
      <h2 id="topic-details">Details</h2>
      <dl className="admin-details">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="admin-links">
        {id && (
          <li>
            <Link href={`/admin/collections/topics/${id}/versions`}>
              Versions
            </Link>
          </li>
        )}
        {status.firstPublishedAt && slug && (
          <li>
            <a href={`/topics/${slug}`} target="_blank" rel="noreferrer">
              View on the site
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
