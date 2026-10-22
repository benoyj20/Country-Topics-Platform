"use client";

import {
  editorMedia,
  type MediaFile,
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
import { useRef, useState } from "react";

import { formatFileSize } from "@/format";

import { Field } from "../components/Field";
import type { FieldTexts } from "../field-text";
import { safeHref } from "../safe-href";
import { deleteRecord, saveRecord, type Written } from "../write";
import { FocalPoint, useObjectUrl } from "./FocalPoint";
import { SelectInput, TextInput } from "./inputs";
import { RecordForm, type Saved } from "./RecordForm";

// The file editor, as Payload's panel edits a file
// (apps/web/src/collections/Media.ts): a document or image uploaded from
// the admin's computer, which a later save may replace, with its
// description and licence, and an image's focal point. Payload checks the
// file's content against the types it takes; only the admin's own file is
// ever uploaded. Several files at once are uploaded by MediaUploads.

export const MEDIA_TEXTS: FieldTexts = {
  file: {
    label: "File",
    description:
      "A PDF, or a JPEG, PNG, or WebP image, at most 20 MB. Only upload files we may publish.",
  },
  alt: {
    label: "Description",
    description:
      "What the file shows or contains, for people who cannot see it and for search.",
  },
  licence: {
    label: "Licence",
    description:
      "Only upload files we may publish (AGENTS.md: licensed photos only).",
  },
  credit: {
    label: "Credit",
    description:
      "Author or owner, as the licence asks, such as 'Photo: A. Example / CC BY 4.0'.",
  },
  sourceUrl: {
    label: "Source link",
    description: "Where the file came from, so others can check it.",
  },
  focalX: {
    label: "Focal point",
    description:
      "Where the image's subject is: a cropped copy, such as a round profile photo, keeps it in view.",
  },
};

const ORDER = Object.keys(MEDIA_TEXTS);

/** The image a focal point is set on: the file chosen, else the one stored. */
function focalImage(
  chosen: File | null,
  chosenUrl: string | null,
  stored: MediaFile | null,
): string | null {
  if (chosen) return chosen.type.startsWith("image/") ? chosenUrl : null;
  return stored?.mimeType?.startsWith("image/")
    ? (safeHref(stored.url) ?? null)
    : null;
}

const LICENCE_OPTIONS = LICENCES.map((value) => ({
  value,
  label: LICENCE_LABELS[value],
}));

function refusedFile(message: string): Written<never> {
  const refusal: Refusal = { fields: { file: [message] }, general: [] };
  return { ok: false, refusal };
}

/**
 * Saves the file's fields, with `file` when one was chosen: as a form,
 * the other fields as JSON in `_payload`, as Payload takes uploads.
 */
async function saveMedia(
  id: string | null,
  values: MediaValues,
  file: File | null,
): Promise<Written<Saved<MediaValues, MediaFile>>> {
  if (!id && !file) return refusedFile("Choose a file to upload.");
  if (file && file.size > UPLOAD_MAX_BYTES) {
    return refusedFile(UPLOAD_TOO_LARGE_MESSAGE);
  }
  let body: unknown = mediaSaveBody(values);
  if (file) {
    const form = new FormData();
    form.append("file", file);
    form.append("_payload", JSON.stringify(body));
    body = form;
  }
  return saveRecord(
    {
      collection: "media",
      id,
      query: mediaSearchParams(),
      body,
      fieldOf: mediaFieldOf,
      schema: storedMediaSchema,
    },
    (doc) => {
      const media = editorMedia(doc);
      return { id: media.id, values: media.values, status: media.file };
    },
  );
}

/** The stored file's details, besides its dates. */
function fileDetails(file: MediaFile): [string, string][] {
  const rows: [string, string][] = [
    ["File", file.filename ?? "None"],
    ["Type", file.mimeType ?? "Unknown"],
    [
      "Size",
      file.filesize === null ? "Unknown" : formatFileSize(file.filesize),
    ],
  ];
  if (file.width && file.height) {
    rows.push(["Dimensions", `${file.width} × ${file.height} px`]);
  }
  return rows;
}

export function MediaForm({
  id,
  values,
  file: stored,
  canEdit,
  notice,
  onCreated,
}: {
  id: string | null;
  values: MediaValues;
  file: MediaFile | null;
  canEdit: boolean;
  notice?: string;
  /** Made from another record's field: called with the new record's id. */
  onCreated?: (id: string) => void;
}) {
  const [chosen, setChosen] = useState<File | null>(null);
  // The file chosen now, and the one the save running sent: one chosen
  // while a save ran is kept for the next save.
  const chosenRef = useRef<File | null>(null);
  const sentRef = useRef<File | null>(null);
  // A new input after each save, so the one sent is no longer shown.
  const [inputKey, setInputKey] = useState(0);
  const choose = (file: File | null) => {
    chosenRef.current = file;
    setChosen(file);
  };
  const chosenUrl = useObjectUrl(chosen);
  return (
    <RecordForm
      id={id}
      values={values}
      status={stored}
      noun="file"
      collection="media"
      canEdit={canEdit}
      canDelete
      readOnlyNotice="You can read this file's details. Only admins upload and edit files."
      notice={notice}
      onCreated={onCreated}
      texts={MEDIA_TEXTS}
      order={ORDER}
      saveBody={mediaSaveBody}
      save={(saving, sent) => {
        sentRef.current = chosenRef.current;
        return saveMedia(saving, sent, sentRef.current);
      }}
      remove={(removing) => deleteRecord("media", removing, mediaFieldOf)}
      pending={chosen !== null}
      onSaved={() => {
        if (chosenRef.current !== sentRef.current) return;
        choose(null);
        setInputKey((key) => key + 1);
      }}
      side={(_, current) => current && <StoredFile file={current} />}
      details={(current) => ({ rows: fileDetails(current) })}
    >
      {(form, current) => {
        const field = form.field("file");
        const focal = form.field("focalX");
        const image = focalImage(chosen, chosenUrl, current);
        return (
          <>
            {!form.readOnly && (
              <Field {...field} required={!id}>
                <input
                  key={inputKey}
                  id={field.id}
                  className="admin-input"
                  type="file"
                  accept={MEDIA_MIME_TYPES.join(",")}
                  {...field.aria}
                  onChange={(event) => {
                    choose(event.target.files?.[0] ?? null);
                    form.clear(["file"]);
                  }}
                />
                {id && (
                  <p className="admin-muted">
                    {chosen
                      ? "Saving replaces the stored file with this one."
                      : "Choose a file only to replace the stored one."}
                  </p>
                )}
              </Field>
            )}
            <TextInput
              form={form}
              name="alt"
              maxLength={MEDIA_TEXT_MAX_LENGTH}
              required
              large
            />
            <SelectInput
              form={form}
              name="licence"
              options={LICENCE_OPTIONS}
              placeholder="Choose a licence"
              required
            />
            <TextInput
              form={form}
              name="credit"
              maxLength={MEDIA_TEXT_MAX_LENGTH}
            />
            <TextInput
              form={form}
              name="sourceUrl"
              type="url"
              maxLength={URL_MAX_LENGTH}
            />
            {image && (
              <Field {...focal}>
                <FocalPoint
                  id={focal.id}
                  src={image}
                  x={form.values.focalX}
                  y={form.values.focalY}
                  disabled={form.readOnly}
                  describedBy={focal.aria["aria-describedby"]}
                  onChange={(focalX, focalY) => form.set({ focalX, focalY })}
                />
              </Field>
            )}
          </>
        );
      }}
    </RecordForm>
  );
}

/** The stored file: an image as it looks, a document as a link. */
function StoredFile({ file }: { file: MediaFile }) {
  const href = safeHref(file.url);
  if (!href) return null;
  return (
    <section className="admin-card" aria-labelledby="stored-file">
      <h2 id="stored-file">Stored file</h2>
      {file.mimeType?.startsWith("image/") && (
        // Served by the backend to staff only, through /api; next/image
        // would fetch it without the staff member's cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="admin-preview" src={href} alt="" />
      )}
      <p>
        <a href={href} target="_blank" rel="noreferrer">
          Open {file.filename ?? "the file"}
        </a>
      </p>
    </section>
  );
}
