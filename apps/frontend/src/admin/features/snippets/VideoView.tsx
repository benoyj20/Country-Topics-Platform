import type { StoredVideo } from "@countrytopics/contracts";
import { formatTime, VIDEO_CHECK_LABELS } from "@countrytopics/domain";
import Link from "next/link";

import { DeleteButton } from "@/admin/records/DeleteButton";
import { when, WorkerDetails } from "@/admin/records/worker-details";
import { formatDateTime } from "@/format";
import { thumbnailUrl, watchUrl } from "@/shared/snippets/youtube-iframe-api";

// A video, as Payload's panel shows it (apps/api/src/collections/Videos.ts):
// read only, with what the worker found. Admins may delete a video no
// snippet uses.

export type VideoSnippet = {
  id: string;
  caption: string | null;
  startS: number | null;
  endS: number | null;
};

export function VideoView({
  video,
  snippets,
  totalSnippets,
  canDelete,
}: {
  video: StoredVideo;
  snippets: VideoSnippet[];
  totalSnippets: number;
  canDelete: boolean;
}) {
  return (
    <>
      {canDelete && (
        <DeleteButton collection="videos" id={video.id} noun="video" />
      )}
      <p className="admin-notice">
        Added when a snippet is saved; the worker checks each video with
        YouTube, and nobody edits it here.
      </p>
      <div className="record-editor-columns">
        <div className="record-editor-main">
          <section className="admin-card" aria-labelledby="video-facts">
            <h2 id="video-facts">From YouTube</h2>
            <WorkerDetails
              rows={[
                [
                  "YouTube id",
                  <a
                    key="id"
                    href={watchUrl(video.youtubeId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {video.youtubeId}
                  </a>,
                ],
                ["Title", video.title || "Unknown until checked"],
                ["Channel", video.channel || "Unknown until checked"],
                [
                  "Length",
                  typeof video.durationS === "number"
                    ? formatTime(video.durationS)
                    : "Known when the worker has a YouTube Data API key",
                ],
              ]}
            />
          </section>
          <section className="admin-card" aria-labelledby="video-snippets">
            <h2 id="video-snippets">Snippets cut from it</h2>
            {snippets.length === 0 ? (
              <p className="admin-muted">None; it can be deleted.</p>
            ) : (
              <ul className="admin-view-rows">
                {snippets.map((snippet) => (
                  <li key={snippet.id}>
                    <Link href={`/admin/collections/snippets/${snippet.id}`}>
                      {snippet.caption || "Untitled snippet"}
                    </Link>
                    {snippet.startS !== null && snippet.endS !== null
                      ? ` (${formatTime(snippet.startS)}–${formatTime(snippet.endS)})`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
            {totalSnippets > snippets.length && (
              <p className="admin-muted">
                And {totalSnippets - snippets.length} more:{" "}
                <Link
                  href={`/admin/collections/snippets?video=${encodeURIComponent(video.id)}`}
                >
                  list them all
                </Link>
                .
              </p>
            )}
          </section>
        </div>
        <aside className="record-editor-side" aria-label="Check">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by /thumbnails with its own cache headers */}
          <img
            className="admin-preview"
            src={thumbnailUrl(video.youtubeId)}
            alt=""
          />
          <section className="admin-card" aria-labelledby="video-check">
            <h2 id="video-check">Check</h2>
            <p>
              <span
                className={
                  video.checkStatus === "playable"
                    ? "admin-badge good"
                    : "admin-badge"
                }
              >
                {VIDEO_CHECK_LABELS[video.checkStatus]}
              </span>
            </p>
            {video.checkMessage && <p>{video.checkMessage}</p>}
            <WorkerDetails
              rows={[
                ["Checked", when(video.checkedAt)],
                ["First found playable", when(video.confirmedAt)],
                ["Created", formatDateTime(video.createdAt)],
                ["Updated", formatDateTime(video.updatedAt)],
              ]}
            />
            <p className="admin-muted">
              Snippets back published topics only once their video was found
              playable.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
