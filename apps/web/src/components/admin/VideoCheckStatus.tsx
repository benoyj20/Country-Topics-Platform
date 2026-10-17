"use client";

import {
  formatTime,
  type VideoCheckStatus as Status,
} from "@countrytopics/domain";
import { Banner, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";

import { useVideoRecord } from "./use-video-record";

const BANNER_TYPES: Record<Status, "success" | "info" | "error"> = {
  pending: "info",
  playable: "success",
  not_embeddable: "error",
  unavailable: "error",
  failed: "error",
};

const HEADLINES: Record<Status, string> = {
  pending: "YouTube check pending: the worker checks the video after saving.",
  playable: "Playable on this site.",
  not_embeddable: "This video cannot be played on other sites.",
  unavailable: "This video was removed or is private.",
  failed: "The YouTube check could not finish. Save again to retry.",
};

/** What the worker found about the snippet's video, in the sidebar. */
export const VideoCheckStatus: UIFieldClientComponent = () => {
  const youtubeId = useFormFields(([fields]) => {
    const value = fields.youtubeId?.value;
    return typeof value === "string" ? value : null;
  });
  const record = useVideoRecord(youtubeId);

  if (record.kind === "none") return null;
  if (record.kind === "error") {
    return <Banner type="info">Could not read the video&apos;s check.</Banner>;
  }
  if (record.kind === "new") {
    return (
      <Banner type="info">
        After you save, the worker checks this video with YouTube. Reopen the
        snippet to see the result.
      </Banner>
    );
  }
  const { video } = record;
  const facts = [
    video.title,
    video.channel,
    typeof video.durationS === "number" ? formatTime(video.durationS) : null,
  ].filter(Boolean);
  return (
    <Banner type={BANNER_TYPES[video.checkStatus]}>
      <strong>{HEADLINES[video.checkStatus]}</strong>
      {facts.length > 0 ? <div>{facts.join(" · ")}</div> : null}
      {video.checkMessage ? <div>{video.checkMessage}</div> : null}
      {video.checkStatus !== "playable" && video.confirmedAt ? (
        <div>
          It was playable on {new Date(video.confirmedAt).toLocaleDateString()},
          so topics can still use this snippet; visitors see its transcript.
        </div>
      ) : null}
    </Banner>
  );
};
