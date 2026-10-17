"use client";

import { LINK_ARCHIVE_STATUSES } from "@countrytopics/domain";
import { Banner, useConfig, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useEffect, useState } from "react";
import * as z from "zod";

const LOOKUP_DELAY_MS = 400;

const archiveList = z.object({
  docs: z.array(
    z.object({
      status: z.enum(LINK_ARCHIVE_STATUSES),
      archiveUrl: z.string().nullish(),
      capturedAt: z.string().nullish(),
      message: z.string().nullish(),
    }),
  ),
});
type Archive = z.infer<typeof archiveList>["docs"][number];

type State =
  { kind: "waiting" } | { kind: "found"; archive: Archive } | { kind: "error" };

/**
 * Shows whether the Wayback Machine holds a copy of an evidence link: the
 * worker looks for one, or saves one, after the topic is saved.
 */
export const LinkArchiveStatus: UIFieldClientComponent = ({ path }) => {
  const { config } = useConfig();
  // The link sits next to this field in the same evidence row.
  const urlPath = path.replace(/[^.]+$/, "url");
  const value = useFormFields(([fields]) => fields[urlPath]?.value);
  const url =
    typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
  // Kept with the link it describes, so a result never shows for another link.
  const [result, setResult] = useState<{ url: string; state: State } | null>(
    null,
  );

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({
        "where[url][equals]": url,
        limit: "1",
        depth: "0",
      });
      try {
        const response = await fetch(
          `${config.serverURL}${config.routes.api}/link-archives?${params}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
        const [archive] = archiveList.parse(await response.json()).docs;
        setResult({
          url,
          state: archive ? { kind: "found", archive } : { kind: "waiting" },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setResult({ url, state: { kind: "error" } });
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, config.serverURL, config.routes.api]);

  if (!url || result?.url !== url) return null;
  const { state } = result;
  if (state.kind === "error") {
    return <Banner type="info">Could not check the archived copy.</Banner>;
  }
  if (state.kind === "waiting") {
    return (
      <Banner type="info">
        After you save, the worker copies this page to the Wayback Machine.
        Reopen the topic later to see the copy.
      </Banner>
    );
  }
  const { archive } = state;
  if (archive.status === "archived" && archive.archiveUrl) {
    const taken = archive.capturedAt
      ? new Date(archive.capturedAt).toLocaleDateString()
      : "an unknown date";
    return (
      <Banner type="success">
        <a href={archive.archiveUrl} target="_blank" rel="noreferrer">
          Archived copy
        </a>{" "}
        from {taken}. {archive.message}
      </Banner>
    );
  }
  return (
    <Banner type="error">
      No archived copy. {archive.message} You can paste a copy from another
      archive below.
    </Banner>
  );
};
