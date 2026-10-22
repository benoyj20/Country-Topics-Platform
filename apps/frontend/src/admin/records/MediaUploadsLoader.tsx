"use client";

import dynamic from "next/dynamic";

/**
 * The upload of several files, loaded in the browser (ADR 0014: drag and
 * drop ships as static files, never in the Worker).
 */
export const MediaUploadsLoader = dynamic(() => import("./MediaUploads"), {
  ssr: false,
  loading: () => <p className="admin-muted">Loading the upload…</p>,
});
