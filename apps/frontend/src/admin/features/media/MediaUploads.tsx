"use client";

import {
  EMPTY_MEDIA,
  editorMedia,
  mediaFieldOf,
  mediaSaveBody,
  mediaSearchParams,
  type MediaValues,
  type Refusal,
  storedMediaSchema,
} from "@countrytopics/contracts";
import {
  LICENCE_LABELS,
  LICENCES,
  MEDIA_MIME_TYPES,
  MEDIA_TEXT_MAX_LENGTH,
  UPLOAD_MAX_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import Link from "next/link";
import { type DragEvent, useId, useRef, useState } from "react";

import { Field } from "@/admin/components/Field";
import { useLeaveGuard } from "@/admin/editor-guards";
import { fieldProps } from "@/admin/field-text";
import { saveRecord } from "@/admin/write";
import { formatFileSize } from "@/format";

import { FocalPoint, useObjectUrl } from "./FocalPoint";
import { MEDIA_TEXTS } from "./MediaForm";

import "./media.css";

// Several files uploaded at once (ADR 0014, phase 11), as Payload's panel's
// bulk upload does: dropped or chosen together, each described and
// licensed (with a licence and credit set for all of them in one go), an
// image's focal point set by clicking it, then uploaded one after
// another. Payload checks each file's content; a refused file keeps its
// messages and is tried again with the next upload.

/** Files one upload takes at most; more wait for the next. */
export const MEDIA_UPLOADS_MAX = 20;

type Upload = {
  key: number;
  file: File;
  values: MediaValues;
  state: "waiting" | "uploading" | "done" | "refused";
  refusal: Refusal | null;
  /** The record made, once uploaded. */
  saved: { id: string; title: string } | null;
};

const LICENCE_OPTIONS = LICENCES.map((value) => ({
  value,
  label: LICENCE_LABELS[value],
}));

const ACCEPTED = new Set<string>(MEDIA_MIME_TYPES);

/** A choice of licence: one of the licences, or none yet. */
function licenceOf(value: string): MediaValues["licence"] {
  return LICENCES.find((licence) => licence === value) ?? "";
}

/** What is wrong with a file before it is sent, or null. */
function problemOf(file: File): string | null {
  if (file.size > UPLOAD_MAX_BYTES) return UPLOAD_TOO_LARGE_MESSAGE;
  if (!ACCEPTED.has(file.type)) {
    return "Only PDFs and JPEG, PNG, or WebP images can be uploaded.";
  }
  return null;
}

async function upload(item: Upload) {
  const form = new FormData();
  form.append("file", item.file);
  form.append("_payload", JSON.stringify(mediaSaveBody(item.values)));
  return saveRecord(
    {
      collection: "media",
      id: null,
      query: mediaSearchParams(),
      body: form,
      fieldOf: mediaFieldOf,
      schema: storedMediaSchema,
    },
    (doc) => {
      const media = editorMedia(doc);
      return {
        id: media.id,
        title: media.values.alt || media.file.filename || "",
      };
    },
  );
}

export default function MediaUploads() {
  const id = useId();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [licence, setLicence] = useState<MediaValues["licence"]>("");
  const [credit, setCredit] = useState("");
  const nextKey = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const waiting = uploads.filter((item) => item.state !== "done");
  useLeaveGuard(waiting.length > 0);

  function add(files: readonly File[]) {
    setNotice(null);
    const room = MEDIA_UPLOADS_MAX - waiting.length;
    const taken = files.slice(0, Math.max(0, room));
    if (taken.length < files.length) {
      setNotice(
        `Only ${MEDIA_UPLOADS_MAX} files go up at once: upload these, then add the rest.`,
      );
    }
    setUploads((current) => [
      ...current,
      ...taken.map((file): Upload => {
        const problem = problemOf(file);
        return {
          key: nextKey.current++,
          file,
          values: EMPTY_MEDIA,
          state: problem ? "refused" : "waiting",
          refusal: problem
            ? { fields: { file: [problem] }, general: [] }
            : null,
          saved: null,
        };
      }),
    ]);
  }

  function change(key: number, patch: Partial<MediaValues>) {
    setUploads((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, values: { ...item.values, ...patch } }
          : item,
      ),
    );
  }

  function applyToAll() {
    setUploads((current) =>
      current.map((item) =>
        item.state === "done"
          ? item
          : {
              ...item,
              values: {
                ...item.values,
                ...(licence ? { licence } : {}),
                ...(credit.trim() ? { credit: credit.trim() } : {}),
              },
            },
      ),
    );
  }

  async function uploadAll() {
    setRunning(true);
    setNotice(null);
    for (const item of uploads) {
      if (item.state === "done") continue;
      // A file refused before it was sent is sent only once it is fixed.
      if (problemOf(item.file)) continue;
      setUploads((current) =>
        current.map((each) =>
          each.key === item.key ? { ...each, state: "uploading" } : each,
        ),
      );
      const answer = await upload(item);
      setUploads((current) =>
        current.map((each) =>
          each.key !== item.key
            ? each
            : answer.ok
              ? { ...each, state: "done", refusal: null, saved: answer.result }
              : { ...each, state: "refused", refusal: answer.refusal },
        ),
      );
      // Too many saves in a short time: the rest would be refused too.
      if (
        !answer.ok &&
        answer.refusal.general.some((message) => message.startsWith("Too many"))
      ) {
        break;
      }
    }
    setRunning(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    add([...event.dataTransfer.files]);
  }

  const done = uploads.filter((item) => item.state === "done");
  return (
    <div className="admin-stack">
      <div
        className={dragging ? "admin-dropzone dragging" : "admin-dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>
          <strong>Drop files here</strong>, or{" "}
          <button
            type="button"
            className="admin-link-button"
            onClick={() => input.current?.click()}
          >
            choose them
          </button>
          .
        </p>
        <p className="admin-muted">
          PDFs, and JPEG, PNG, or WebP images, at most{" "}
          {formatFileSize(UPLOAD_MAX_BYTES)} each and {MEDIA_UPLOADS_MAX} at a
          time. Only upload files we may publish.
        </p>
        <input
          ref={input}
          id={`${id}-files`}
          className="admin-visually-hidden"
          type="file"
          multiple
          accept={MEDIA_MIME_TYPES.join(",")}
          aria-label="Choose files to upload"
          onChange={(event) => {
            add([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {waiting.length > 1 && (
        <fieldset className="admin-card admin-stack">
          <legend>For every file</legend>
          <div className="admin-fields two">
            <Field id={`${id}-licence`} label="Licence">
              <select
                id={`${id}-licence`}
                className="admin-input"
                value={licence}
                onChange={(event) => setLicence(licenceOf(event.target.value))}
              >
                <option value="">Choose a licence</option>
                {LICENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-credit`} label="Credit">
              <input
                id={`${id}-credit`}
                className="admin-input"
                value={credit}
                maxLength={MEDIA_TEXT_MAX_LENGTH}
                onChange={(event) => setCredit(event.target.value)}
              />
            </Field>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              className="admin-button secondary"
              disabled={(!licence && !credit.trim()) || running}
              onClick={applyToAll}
            >
              Use for every file not uploaded yet
            </button>
          </div>
        </fieldset>
      )}

      {uploads.length > 0 && (
        <ol className="admin-uploads">
          {uploads.map((item, index) => (
            <UploadCard
              key={item.key}
              item={item}
              number={index + 1}
              disabled={running}
              onChange={(patch) => change(item.key, patch)}
              onRemove={() =>
                setUploads((current) =>
                  current.filter((each) => each.key !== item.key),
                )
              }
            />
          ))}
        </ol>
      )}

      {uploads.length > 0 && (
        <div className="record-editor-bar admin-uploads-bar">
          <p className="record-editor-state" role="status">
            {running
              ? "Uploading…"
              : waiting.length === 0
                ? `Uploaded ${done.length} ${done.length === 1 ? "file" : "files"}.`
                : `${waiting.length} ${waiting.length === 1 ? "file" : "files"} to upload${done.length ? `, ${done.length} uploaded` : ""}.`}
          </p>
          <div className="admin-actions">
            {waiting.length === 0 ? (
              <Link href="/admin/collections/media" className="admin-button">
                Go to the files
              </Link>
            ) : (
              <button
                type="button"
                className="admin-button"
                disabled={running}
                onClick={() => void uploadAll()}
              >
                {running
                  ? "Uploading…"
                  : `Upload ${waiting.length} ${waiting.length === 1 ? "file" : "files"}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadCard({
  item,
  number,
  disabled,
  onChange,
  onRemove,
}: {
  item: Upload;
  number: number;
  disabled: boolean;
  onChange: (patch: Partial<MediaValues>) => void;
  onRemove: () => void;
}) {
  const prefix = `upload-${item.key}`;
  const preview = useObjectUrl(
    item.file.type.startsWith("image/") ? item.file : null,
  );
  const locked =
    disabled || item.state === "done" || item.state === "uploading";
  const messages = (key: string) => item.refusal?.fields[key];
  const field = (key: string) =>
    fieldProps(MEDIA_TEXTS, key, item.refusal, `${prefix}-`);
  const alt = field("alt");
  const licence = field("licence");
  const credit = field("credit");
  const source = field("sourceUrl");
  const focal = field("focalX");
  return (
    <li className="admin-card admin-upload">
      <div className="admin-title-row">
        <h2 className="admin-upload-name">
          {number}. {item.file.name}{" "}
          <span className="admin-muted">
            ({formatFileSize(item.file.size)})
          </span>
        </h2>
        {item.state === "done" && item.saved ? (
          <span className="admin-badge good">
            Uploaded:{" "}
            <Link href={`/admin/collections/media/${item.saved.id}`}>
              open it
            </Link>
          </span>
        ) : item.state === "uploading" ? (
          <span className="admin-badge">Uploading…</span>
        ) : (
          <button
            type="button"
            className="admin-link-button danger"
            disabled={disabled}
            onClick={onRemove}
          >
            Remove {item.file.name}
          </button>
        )}
      </div>
      {item.refusal && (
        <div className="admin-error-summary" role="alert">
          <h3>Not uploaded</h3>
          <ul>
            {[...item.refusal.general, ...(messages("file") ?? [])].map(
              (message) => (
                <li key={message}>{message}</li>
              ),
            )}
            {Object.entries(item.refusal.fields)
              .filter(([key]) => key !== "file")
              .map(([key, list]) => (
                <li key={key}>
                  {MEDIA_TEXTS[key]?.label ?? key}: {list.join(" ")}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="admin-upload-fields">
        <div className="admin-stack">
          <Field {...alt} required>
            <input
              id={alt.id}
              className="admin-input"
              value={item.values.alt}
              maxLength={MEDIA_TEXT_MAX_LENGTH}
              disabled={locked}
              {...alt.aria}
              onChange={(event) => onChange({ alt: event.target.value })}
            />
          </Field>
          <Field {...licence} required>
            <select
              id={licence.id}
              className="admin-input"
              value={item.values.licence}
              disabled={locked}
              {...licence.aria}
              onChange={(event) =>
                onChange({ licence: licenceOf(event.target.value) })
              }
            >
              <option value="">Choose a licence</option>
              {LICENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field {...credit}>
            <input
              id={credit.id}
              className="admin-input"
              value={item.values.credit}
              maxLength={MEDIA_TEXT_MAX_LENGTH}
              disabled={locked}
              {...credit.aria}
              onChange={(event) => onChange({ credit: event.target.value })}
            />
          </Field>
          <Field {...source}>
            <input
              id={source.id}
              className="admin-input"
              type="url"
              inputMode="url"
              value={item.values.sourceUrl}
              maxLength={URL_MAX_LENGTH}
              disabled={locked}
              {...source.aria}
              onChange={(event) => onChange({ sourceUrl: event.target.value })}
            />
          </Field>
        </div>
        {preview ? (
          <Field {...focal}>
            <FocalPoint
              id={focal.id}
              src={preview}
              x={item.values.focalX}
              y={item.values.focalY}
              disabled={locked}
              describedBy={focal.aria["aria-describedby"]}
              onChange={(focalX, focalY) => onChange({ focalX, focalY })}
            />
          </Field>
        ) : (
          <p className="admin-muted">A document: it has no focal point.</p>
        )}
      </div>
    </li>
  );
}
