import type { Metadata } from "next";
import { Suspense } from "react";

import { TopicBrowser } from "@/components/public/TopicBrowser";

// The same for everyone: the browser reads the filters from the URL and asks
// /api/v1/topics for the results (ADR 0008). Equal to PUBLIC_REVALIDATE_S.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Topics - Country Topics",
  description:
    "Browse and search every topic by country, category, tag, person, and evidence.",
};

export default function TopicsPage() {
  return (
    <div className="stack">
      <h1>Topics</h1>
      <noscript>
        <p className="notice">
          Browsing and search need JavaScript. Each country&apos;s page lists
          its topics without it.
        </p>
      </noscript>
      <Suspense fallback={<p className="muted">Loading topics…</p>}>
        <TopicBrowser />
      </Suspense>
    </div>
  );
}
