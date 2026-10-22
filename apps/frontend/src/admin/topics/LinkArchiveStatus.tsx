"use client";

import { LINK_ARCHIVE_STATUSES } from "@countrytopics/domain";
import { useEffect, useState } from "react";
import * as z from "zod";

import { formatDateTime } from "@/format";

import { safeHref } from "../safe-href";

/** How long typing a link pauses before its copy is looked up. */
const LOOKUP_DELAY_MS = 400;

const Archives = z.object({
  docs: z.array(
    z.object({
      status: z.enum(LINK_ARCHIVE_STATUSES),
      archiveUrl: z.string().nullish(),
      capturedAt: z.string().nullish(),
      message: z.string().nullish(),
    }),
  ),
});
type Archive = z.infer<typeof Archives>["docs"][number];

type Lookup =
  | { kind: "waiting" }
  | { kind: "found"; archive: Archive }
  | { kind: "failed" };

/**
 * Whether the Wayback Machine holds a copy of an evidence link: the worker
 * looks for one, or saves one, after the topic is saved.
 */
export function LinkArchiveStatus({ url }: { url: string }) {
  const link = /^https?:\/\//.test(url.trim()) ? url.trim() : null;
  // Kept with the link it describes, so a result never shows for another.
  const [result, setResult] = useState<{ url: string; lookup: Lookup } | null>(
    null,
  );

  useEffect(() => {
    if (!link) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({
        "where[url][equals]": link,
        limit: "1",
        depth: "0",
      });
      for (const field of ["status", "archiveUrl", "capturedAt", "message"]) {
        params.set(`select[${field}]`, "true");
      }
      try {
        const response = await fetch(`/api/link-archives?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const [archive] = Archives.parse(await response.json()).docs;
        setResult({
          url: link,
          lookup: archive ? { kind: "found", archive } : { kind: "waiting" },
        });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ url: link, lookup: { kind: "failed" } });
        }
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [link]);

  if (!link || result?.url !== link) return null;
  const { lookup } = result;
  if (lookup.kind === "failed") {
    return <p className="admin-notice">Could not check the archived copy.</p>;
  }
  if (lookup.kind === "waiting") {
    return (
      <p className="admin-notice">
        After you save, the worker copies this page to the Wayback Machine.
        Reopen the topic later to see the copy.
      </p>
    );
  }
  const { archive } = lookup;
  const copy = safeHref(archive.archiveUrl);
  if (archive.status === "archived" && copy) {
    return (
      <p className="admin-notice good">
        <a href={copy} target="_blank" rel="noreferrer">
          Archived copy
        </a>{" "}
        from{" "}
        {archive.capturedAt
          ? formatDateTime(archive.capturedAt)
          : "an unknown date"}
        . {archive.message}
      </p>
    );
  }
  return (
    <p className="admin-notice error">
      No archived copy. {archive.message} You can paste a copy from another
      archive below.
    </p>
  );
}
