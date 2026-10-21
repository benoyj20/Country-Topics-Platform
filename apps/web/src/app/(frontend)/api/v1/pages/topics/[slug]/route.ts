import { topicPage } from "@/public/cached";
import { slugPageData } from "@/public/page-data";

// GET /api/v1/pages/topics/:slug: the topic page's data (ADR 0014), or 404
// where the page would be missing.

export const dynamic = "force-dynamic";

export const GET = slugPageData(
  topicPage,
  "No published topic has this address.",
);
