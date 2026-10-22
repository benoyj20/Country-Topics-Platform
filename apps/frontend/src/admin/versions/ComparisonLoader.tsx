"use client";

import dynamic from "next/dynamic";

/**
 * The comparison of two versions, loaded in the browser (ADR 0014: heavy
 * parts of the admin ship as static files, never in the Worker).
 */
export const ComparisonLoader = dynamic(() => import("./Comparison"), {
  ssr: false,
  loading: () => <p className="admin-muted">Comparing the versions…</p>,
});
