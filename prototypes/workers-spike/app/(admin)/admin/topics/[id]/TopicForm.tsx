"use client";

import type { LexicalEditor } from "lexical";
import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { canonicalJson, type SaveErrors, saveErrors } from "../../save-result";
import {
  type CountryOption,
  type EditableTopic,
  savedTopic,
} from "../../topic-data";

// The topic editor of the admin spike (ADR 0014, phase 2): the title, the
// summary, one relation (the countries), the body, and the change note,
// saved as a draft or published through Payload's REST API, with the
// backend's refusals shown beside the fields they name.

const BodyEditor = dynamic(() => import("../../BodyEditor"), {
  ssr: false,
  loading: () => <p className="muted">Loading the editor…</p>,
});

const SHOWN_FIELDS = new Set([
  "title",
  "summary",
  "countries",
  "body",
  "changeNote",
]);

function FieldErrors({
  path,
  errors,
}: {
  path: string;
  errors: SaveErrors | null;
}) {
  const messages = errors?.fields[path];
  if (!messages?.length) return null;
  return (
    <p className="field-error" id={`${path}-error`} role="alert">
      {messages.join(" ")}
    </p>
  );
}

function Field({
  path,
  label,
  errors,
  children,
}: {
  path: string;
  label: string;
  errors: SaveErrors | null;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={path}>{label}</label>
      {children}
      <FieldErrors path={path} errors={errors} />
    </div>
  );
}

export function TopicForm({
  topic: loaded,
  countries,
  siteOrigin,
}: {
  topic: EditableTopic;
  countries: CountryOption[];
  siteOrigin: string;
}) {
  const [topic, setTopic] = useState(loaded);
  const [title, setTitle] = useState(loaded.title ?? "");
  const [summary, setSummary] = useState(loaded.summary ?? "");
  const [selected, setSelected] = useState<string[]>(loaded.countries ?? []);
  const [changeNote, setChangeNote] = useState(loaded.changeNote ?? "");
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState<SaveErrors | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The body is read from the editor when saving, not copied on every
  // keystroke.
  const editorRef = useRef<LexicalEditor | null>(null);

  const invalid = (path: string) => Boolean(errors?.fields[path]?.length);
  const describedBy = (path: string) =>
    invalid(path) ? `${path}-error` : undefined;
  const names = useMemo(
    () => new Map(countries.map((country) => [country.id, country.name])),
    [countries],
  );
  const shown = useMemo(
    () =>
      countries.filter((country) =>
        country.name.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [countries, filter],
  );

  async function send(publish: boolean) {
    // Until the editor has loaded, the body is the one loaded.
    const body = editorRef.current
      ? editorRef.current.getEditorState().toJSON()
      : (loaded.body ?? null);
    let response: Response;
    try {
      response = await fetch(
        `/api/topics/${encodeURIComponent(topic.id)}?depth=0${publish ? "" : "&draft=true"}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            summary,
            countries: selected,
            body,
            changeNote,
            _status: publish ? "published" : "draft",
          }),
        },
      );
    } catch {
      setErrors({ fields: {}, general: ["The backend could not be reached."] });
      return;
    }
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setErrors(saveErrors(response.status, answer, SHOWN_FIELDS));
      return;
    }
    const doc = savedTopic(answer);
    if (!doc) {
      setErrors({
        fields: {},
        general: [
          "The backend accepted the save but did not send the topic back. Reload the page to see what was saved before saving again.",
        ],
      });
      return;
    }
    setTopic(doc);
    setChangeNote(doc.changeNote ?? "");
    const kept = canonicalJson(doc.body ?? null) === canonicalJson(body);
    setNotice(
      `${publish ? "Published" : "Draft saved"}. ${
        kept
          ? "The backend stored the body exactly as sent."
          : "The backend stored a different body from the one sent."
      }`,
    );
  }

  async function save(publish: boolean) {
    setSaving(true);
    setErrors(null);
    setNotice(null);
    try {
      await send(publish);
    } finally {
      setSaving(false);
    }
  }

  const published = Boolean(topic.firstPublishedAt);
  return (
    <form
      className="topic-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
    >
      <p className="muted">
        {topic.state ? `Topic: ${topic.state}` : "Topic: new"}
        {` · Latest version: ${topic._status === "published" ? "published" : "draft"}`}
        {published && topic.slug ? (
          <>
            {" · "}
            <a
              href={`${siteOrigin}/topics/${topic.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View on the site
            </a>
          </>
        ) : null}
      </p>
      {errors?.general.length ? (
        <div className="form-error" role="alert">
          {errors.general.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {notice ? (
        <p className="form-notice" role="status">
          {notice}
        </p>
      ) : null}

      <Field path="title" label="Title" errors={errors}>
        <input
          id="title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={invalid("title")}
          aria-describedby={describedBy("title")}
        />
      </Field>
      <Field path="summary" label="Summary" errors={errors}>
        <textarea
          id="summary"
          value={summary}
          maxLength={500}
          rows={3}
          onChange={(event) => setSummary(event.target.value)}
          aria-invalid={invalid("summary")}
          aria-describedby={describedBy("summary")}
        />
      </Field>
      <Field path="countries" label="Countries" errors={errors}>
        <p className="muted">
          {selected.length
            ? selected.map((id) => names.get(id) ?? id).join(", ")
            : "None chosen"}
        </p>
        <input
          id="countries"
          type="search"
          placeholder="Filter countries"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-invalid={invalid("countries")}
          aria-describedby={describedBy("countries")}
        />
        <div className="choices">
          {shown.map((country) => (
            <label key={country.id} className="choice">
              <input
                type="checkbox"
                checked={selected.includes(country.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, country.id]
                      : current.filter((id) => id !== country.id),
                  )
                }
              />
              {country.name}
            </label>
          ))}
        </div>
      </Field>
      <Field path="body" label="Body" errors={errors}>
        <BodyEditor
          initial={loaded.body ?? null}
          editorRef={editorRef}
          invalid={invalid("body")}
        />
      </Field>
      <Field path="changeNote" label="Change note" errors={errors}>
        <textarea
          id="changeNote"
          value={changeNote}
          rows={2}
          onChange={(event) => setChangeNote(event.target.value)}
          aria-invalid={invalid("changeNote")}
          aria-describedby={describedBy("changeNote")}
        />
        <p className="muted">
          {published
            ? "Needed to publish: what changed and why, shown in the public change log."
            : "Optional for the first publish."}
        </p>
      </Field>
      <div className="actions">
        <button type="submit" disabled={saving}>
          Save draft
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving}
          onClick={() => void save(true)}
        >
          Publish
        </button>
      </div>
    </form>
  );
}
