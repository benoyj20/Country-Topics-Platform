"use client";

import {
  editorSnippet,
  recordOf,
  snippetFieldOf,
  snippetSaveBody,
  snippetSearchParams,
  type SnippetStatus,
  type SnippetValues,
  storedSnippetSchema,
} from "@countrytopics/contracts";
import {
  clipProblems,
  formatTime,
  LANGUAGE_TAG_MAX_LENGTH,
  SNIPPET_CAPTION_MAX_LENGTH,
  snippetTranscript,
  TRANSCRIPT_MAX_LENGTH,
  type TranscriptSegment,
  VIDEO_CHECK_LABELS,
  type VideoCheckStatus,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import Link from "next/link";
import { useMemo } from "react";

import { counted, formatDate } from "@/format";
import { SnippetPlayer } from "@/components/snippets/SnippetPlayer";

import { Field } from "../components/Field";
import { RelationPicker } from "../components/RelationPicker";
import { pickerAria } from "../field-text";
import { deleteRecord, saveRecord } from "../write";
import { ClipEditor } from "./ClipEditor";
import { TextArea, TextInput } from "./inputs";
import { type FormApi, RecordForm } from "./RecordForm";
import { SNIPPET_TEXTS, TIMEBASE_LABELS } from "./record-texts";
import { type SnippetVideoState, useSnippetVideo } from "./snippet-video";

// The snippet editor, as Payload's panel edits a snippet
// (apps/api/src/collections/Snippets.ts): its caption, the clip set with
// the player, who speaks and in what language, the transcript pasted from
// YouTube with what it keeps, a preview as visitors will see it, and the
// worker's check of the video.

const ORDER = Object.keys(SNIPPET_TEXTS);

/** One array for "no lines", so the preview's timer is not reset on every render. */
const NO_SEGMENTS: TranscriptSegment[] = [];

const HEADLINES: Record<VideoCheckStatus, string> = {
  pending: "YouTube check pending: the worker checks the video after saving.",
  playable: "Playable on this site.",
  not_embeddable: "This video cannot be played on other sites.",
  unavailable: "This video was removed or is private.",
  failed: "The YouTube check could not finish. Save again to retry.",
};

export function SnippetForm({
  id,
  values,
  status,
  canEdit,
  notice,
  onCreated,
}: {
  id: string | null;
  values: SnippetValues;
  status: SnippetStatus | null;
  canEdit: boolean;
  notice?: string;
  /** Made from another record's field: called with the new record's id. */
  onCreated?: (id: string) => void;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="snippet"
      collection="snippets"
      canEdit={canEdit}
      canDelete
      readOnlyNotice="You can read this snippet. Only admins edit snippets."
      notice={notice}
      onCreated={onCreated}
      texts={SNIPPET_TEXTS}
      order={ORDER}
      saveBody={snippetSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "snippets",
            id: saving,
            query: snippetSearchParams(),
            body: snippetSaveBody(sent),
            fieldOf: snippetFieldOf,
            schema: storedSnippetSchema,
          },
          editorSnippet,
        )
      }
      remove={(removing) => deleteRecord("snippets", removing, snippetFieldOf)}
    >
      {(form) => (
        <SnippetFields form={form} savedAt={status?.updatedAt ?? null} />
      )}
    </RecordForm>
  );
}

function SnippetFields({
  form,
  savedAt,
}: {
  form: FormApi<SnippetValues>;
  /** When the snippet was last saved, after which its video is read again. */
  savedAt: string | null;
}) {
  const { values, readOnly } = form;
  const video = useSnippetVideo(values.youtubeId, savedAt);
  const found = video.kind === "found" ? video.video : null;
  const speaker = form.field("speaker");
  const timebase = form.field("transcriptTimebase");
  const { startS: start_s, endS: end_s } = values;
  const clipValid =
    start_s !== null &&
    end_s !== null &&
    clipProblems({ start_s, end_s }).errors.length === 0;
  // The transcript can be 200,000 characters: read once per change.
  const transcript = useMemo(
    () =>
      clipValid && start_s !== null && end_s !== null
        ? snippetTranscript({
            text: values.transcriptText,
            timebase: values.transcriptTimebase,
            start_s,
            end_s,
          })
        : null,
    [
      clipValid,
      start_s,
      end_s,
      values.transcriptText,
      values.transcriptTimebase,
    ],
  );

  return (
    <>
      <TextInput
        form={form}
        name="caption"
        maxLength={SNIPPET_CAPTION_MAX_LENGTH}
        required
        large
      />
      <ClipEditor
        clip={values}
        onChange={(patch) =>
          form.update(
            (current) => ({ ...current, ...patch }),
            Object.keys(patch),
          )
        }
        fields={{
          youtubeId: form.field("youtubeId"),
          startS: form.field("startS"),
          endS: form.field("endS"),
        }}
        knownDuration_s={found?.durationS ?? null}
        readOnly={readOnly}
      />
      <div className="admin-fields two">
        <Field {...speaker}>
          <RelationPicker
            id={speaker.id}
            collection="individuals"
            value={values.speaker ? [values.speaker] : []}
            onChange={(chosen) => form.set({ speaker: chosen.at(-1) ?? null })}
            toRecord={(match) => recordOf("individuals", match)}
            disabled={readOnly}
            {...pickerAria(speaker)}
          />
        </Field>
        <TextInput
          form={form}
          name="language"
          maxLength={LANGUAGE_TAG_MAX_LENGTH}
          required
        />
      </div>
      <TextArea
        form={form}
        name="transcriptText"
        maxLength={TRANSCRIPT_MAX_LENGTH}
        rows={10}
      />
      <fieldset
        id={timebase.id}
        className="admin-choices"
        aria-describedby={timebase.aria["aria-describedby"]}
      >
        <legend>
          {timebase.label}
          <span className="admin-required" aria-hidden="true">
            {" "}
            *
          </span>
        </legend>
        {(["video", "clip"] as const).map((value) => (
          <label key={value} className="admin-check">
            <input
              type="radio"
              name="transcriptTimebase"
              value={value}
              checked={values.transcriptTimebase === value}
              disabled={readOnly}
              onChange={() => form.set({ transcriptTimebase: value })}
            />
            {TIMEBASE_LABELS[value]}
          </label>
        ))}
        {timebase.messages?.length ? (
          <p id={`${timebase.id}-error`} className="admin-field-error">
            {timebase.messages.join(" ")}
          </p>
        ) : null}
      </fieldset>
      <TranscriptSummary
        hasText={values.transcriptText.trim() !== ""}
        clipValid={clipValid}
        transcript={transcript}
      />

      <section className="admin-array" aria-labelledby="snippet-preview">
        <h2 id="snippet-preview">Preview: what visitors see</h2>
        {clipValid &&
        start_s !== null &&
        end_s !== null &&
        YOUTUBE_ID_PATTERN.test(values.youtubeId) ? (
          <SnippetPlayer
            // A new clip starts a new player.
            key={`${values.youtubeId}:${start_s}:${end_s}`}
            youtubeId={values.youtubeId}
            start_s={start_s}
            end_s={end_s}
            caption={values.caption}
            speaker={values.speaker?.title ?? null}
            language={values.language}
            videoTitle={found?.title}
            channel={found?.channel}
            segments={
              transcript && !transcript.problem
                ? transcript.segments
                : NO_SEGMENTS
            }
            videoUnavailable={
              found?.checkStatus === "unavailable" ||
              found?.checkStatus === "not_embeddable"
                ? (found.checkMessage ??
                  "YouTube no longer plays this video here.")
                : null
            }
          />
        ) : (
          <p className="admin-muted">
            Load a video and set a valid start and end to see the preview.
          </p>
        )}
      </section>
      <VideoCheck video={video} />
    </>
  );
}

/**
 * How the pasted transcript was read: lines in the clip, lines outside it,
 * and text before the first timestamp. The backend stores the same result.
 */
function TranscriptSummary({
  hasText,
  clipValid,
  transcript,
}: {
  hasText: boolean;
  clipValid: boolean;
  transcript: ReturnType<typeof snippetTranscript> | null;
}) {
  if (!hasText) return null;
  if (!clipValid) {
    return (
      <p className="admin-notice" role="status">
        Set the clip&apos;s start and end to see which lines it keeps.
      </p>
    );
  }
  if (!transcript) return null;
  if (transcript.problem) {
    return (
      <p className="admin-notice error" role="status">
        {transcript.problem}
      </p>
    );
  }
  const parts = [`${counted(transcript.segments.length, "line")} in the clip`];
  if (transcript.dropped > 0) {
    parts.push(`${counted(transcript.dropped, "line")} outside it left out`);
  }
  if (transcript.skipped > 0) {
    parts.push(
      `${counted(transcript.skipped, "line")} before the first timestamp ignored`,
    );
  }
  return (
    <p className="admin-notice good" role="status">
      {parts.join(" · ")}
    </p>
  );
}

/** What the worker found about the snippet's video. */
function VideoCheck({ video }: { video: SnippetVideoState }) {
  if (video.kind === "none") return null;
  let body;
  if (video.kind === "failed") {
    body = <p>Could not read the video&apos;s check.</p>;
  } else if (video.kind === "new") {
    body = (
      <p>
        After you save, the worker checks this video with YouTube. Reopen the
        snippet to see the result.
      </p>
    );
  } else {
    const { video: record } = video;
    const facts = [
      record.title,
      record.channel,
      typeof record.durationS === "number"
        ? formatTime(record.durationS)
        : null,
    ].filter(Boolean);
    body = (
      <>
        <p>
          <span
            className={
              record.checkStatus === "playable"
                ? "admin-badge good"
                : "admin-badge"
            }
          >
            {VIDEO_CHECK_LABELS[record.checkStatus]}
          </span>{" "}
          {HEADLINES[record.checkStatus]}
        </p>
        {facts.length > 0 && <p>{facts.join(" · ")}</p>}
        {record.checkMessage && <p>{record.checkMessage}</p>}
        {record.checkStatus !== "playable" && record.confirmedAt && (
          <p>
            It was playable on {formatDate(record.confirmedAt)}, so topics can
            still use this snippet; visitors see its transcript.
          </p>
        )}
        <p>
          <Link href={`/admin/collections/videos/${record.id}`}>
            The video&apos;s record
          </Link>
        </p>
      </>
    );
  }
  return (
    <section className="admin-card" aria-labelledby="video-check">
      <h2 id="video-check">Video check</h2>
      {body}
    </section>
  );
}
