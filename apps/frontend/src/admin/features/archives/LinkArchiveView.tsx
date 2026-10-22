import type { StoredLinkArchive } from "@countrytopics/contracts";
import { LINK_ARCHIVE_STATUS_LABELS } from "@countrytopics/domain";

import { when, WorkerDetails } from "@/admin/records/worker-details";
import { safeHref } from "@/admin/safe-href";
import { formatDateTime } from "@/format";

// An archived link, as Payload's panel shows it
// (apps/api/src/collections/LinkArchives.ts): read only, with what the
// worker found.

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
        <WorkerDetails
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
