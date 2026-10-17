import {
  type VideoCheckStatus,
  YOUTUBE_ID_PATTERN,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  parseOrUnavailable,
  requestJson,
  type SourceClient,
  SourceUnavailableError,
} from "./http.ts";

const OEMBED = "YouTube";
const DATA_API = "The YouTube Data API";

/** What YouTube says about a video, as far as embedding it goes. */
export type VideoLookup = {
  status: Exclude<VideoCheckStatus, "pending" | "failed">;
  title: string | null;
  channel: string | null;
  /** Unknown without a Data API key, and for live streams. */
  duration_s: number | null;
  /** Shown to admins; never contains the key or response bodies. */
  message: string;
};

/**
 * YouTube's public oEmbed endpoint (title, channel, and whether the video
 * can be embedded) and, with a key, the Data API (length, embedding, age
 * restriction; one unit of the free 10,000 a day per lookup). Nothing is
 * downloaded from the video itself.
 */
export type YouTube = {
  lookupVideo(youtubeId: string): Promise<VideoLookup>;
};

export type YouTubeOptions = {
  dataApiKey?: string;
  /** Data API failures never change the answer; they are reported here. */
  onDataApiError?: (message: string) => void;
};

const oembed = z.object({ title: z.string(), author_name: z.string() });

const dataApiVideos = z.object({
  items: z
    .array(
      z.object({
        contentDetails: z.object({
          duration: z.string(),
          contentRating: z
            .object({ ytRating: z.string().optional() })
            .optional(),
        }),
        status: z.object({
          embeddable: z.boolean(),
          privacyStatus: z.string(),
        }),
      }),
    )
    .optional(),
});

/**
 * Seconds in an ISO 8601 duration such as PT1M35S. The Data API reports
 * P0D for live streams and upcoming premieres, whose length is unknown.
 */
export function isoDurationSeconds(iso: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    iso,
  );
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((part) =>
    part === undefined ? 0 : Number(part),
  );
  const total =
    (days ?? 0) * 86_400 +
    (hours ?? 0) * 3_600 +
    (minutes ?? 0) * 60 +
    (seconds ?? 0);
  return total > 0 ? total : null;
}

type DataApiDetails = Omit<VideoLookup, "title" | "channel">;

export function createYouTube(
  client: SourceClient,
  { dataApiKey, onDataApiError }: YouTubeOptions = {},
): YouTube {
  /** The Data API's view of the video, or null when it could not answer. */
  async function dataApiDetails(id: string): Promise<DataApiDetails | null> {
    if (!dataApiKey) return null;
    try {
      // The key goes in a header, so it never appears in logged URLs.
      const { status, body } = await requestJson(
        client,
        DATA_API,
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${id}`,
        { headers: { "X-goog-api-key": dataApiKey } },
      );
      if (status !== 200) {
        // 400 and 403 mean a refused key or an exhausted quota.
        throw new SourceUnavailableError(DATA_API, `answered ${status}`);
      }
      const [item] =
        parseOrUnavailable(dataApiVideos, body, DATA_API).items ?? [];
      if (!item || item.status.privacyStatus === "private") {
        return {
          status: "unavailable",
          duration_s: null,
          message:
            "YouTube has no public video with this id: it was removed or is private.",
        };
      }
      const duration_s = isoDurationSeconds(item.contentDetails.duration);
      if (!item.status.embeddable) {
        return {
          status: "not_embeddable",
          duration_s,
          message:
            "The uploader does not allow this video to be played on other sites.",
        };
      }
      if (item.contentDetails.contentRating?.ytRating === "ytAgeRestricted") {
        return {
          status: "not_embeddable",
          duration_s,
          message:
            "The video is age-restricted, so it does not play on other sites.",
        };
      }
      return {
        status: "playable",
        duration_s,
        message: "Checked with oEmbed and the YouTube Data API.",
      };
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      onDataApiError?.(error.message);
      return null;
    }
  }

  return {
    async lookupVideo(id) {
      if (!YOUTUBE_ID_PATTERN.test(id)) {
        throw new Error("Not a YouTube video id");
      }
      const watchUrl = `https://www.youtube.com/watch?v=${id}`;
      // Timeouts, 429, and 5xx throw SourceUnavailableError, to be retried.
      const { status, body } = await requestJson(
        client,
        OEMBED,
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      );
      if (status !== 200 && status !== 401 && status !== 403) {
        // 400 and 404: removed, private, or never existed.
        return {
          status: "unavailable",
          title: null,
          channel: null,
          duration_s: null,
          message:
            "YouTube has no public video with this id: it was removed or is private.",
        };
      }
      const meta =
        status === 200 ? parseOrUnavailable(oembed, body, OEMBED) : null;
      const title = meta?.title ?? null;
      const channel = meta?.author_name ?? null;
      const details = await dataApiDetails(id);
      if (details) return { ...details, title, channel };
      if (!meta) {
        // oEmbed answers 401 or 403 for both; only the Data API can tell.
        return {
          status: "not_embeddable",
          title,
          channel,
          duration_s: null,
          message:
            "YouTube does not allow this video to be played on other sites, or it is private.",
        };
      }
      return {
        status: "playable",
        title,
        channel,
        duration_s: null,
        message: dataApiKey
          ? "Checked with oEmbed; the YouTube Data API did not answer, so the video's length and age restriction are unknown."
          : "Checked with oEmbed. Without a YouTube Data API key, the video's length and age restriction are unknown.",
      };
    },
  };
}
