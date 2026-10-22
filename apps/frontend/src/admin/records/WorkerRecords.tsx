import type { StoredLinkArchive, StoredVideo } from "@countrytopics/contracts";
import {
  formatTime,
  LINK_ARCHIVE_STATUS_LABELS,
  VIDEO_CHECK_LABELS,
} from "@countrytopics/domain";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateTime } from "@/format";
import {
  thumbnailUrl,
  watchUrl,
} from "@/components/snippets/youtube-iframe-api";

import { safeHref } from "../safe-href";
import { DeleteButton } from "./DeleteButton";

// The records only the worker writes, as Payload's panel shows them
// (apps/web/src/collections/Videos.ts, LinkArchives.ts): read only, with
// what the worker found. Admins may delete a video no snippet uses.

const never = "Not yet";
const when = (value: string | null | undefined) =>
  value ? formatDateTime(value) : never;

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="admin-details wide">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

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
            <Details
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
            <Details
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

export function LinkArchiveView({ archive }: { archive: StoredLinkArchive }) {
  const link = safeHref(archive.url);
  const copy = safeHref(archive.archiveUrl);
  return (
    <>
      <p className="admin-notice">
        Filled in by the worker: a copy of an evidence or reference link in the
        Wayback Machine. Nobody edits it here.
      </p>
      <section className="admin-card" aria-labelledby="archive-facts">
        <h2 id="archive-facts">Archived link</h2>
        <Details
          rows={[
            [
              "Link",
              link ? (
                <a key="link" href={link} target="_blank" rel="noreferrer">
                  {archive.url}
                </a>
              ) : (
                archive.url
              ),
            ],
            ["Status", LINK_ARCHIVE_STATUS_LABELS[archive.status]],
            [
              "Archived copy",
              copy ? (
                <a key="copy" href={copy} target="_blank" rel="noreferrer">
                  {archive.archiveUrl}
                </a>
              ) : (
                (archive.archiveUrl ?? "None")
              ),
            ],
            ["Copy taken", when(archive.capturedAt)],
            ["Message", archive.message || "None"],
            ["Checked", when(archive.checkedAt)],
            ["Created", formatDateTime(archive.createdAt)],
            ["Updated", formatDateTime(archive.updatedAt)],
          ]}
        />
      </section>
    </>
  );
}
