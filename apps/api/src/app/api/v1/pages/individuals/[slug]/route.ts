import { individualPage } from "@/public/cached";
import { slugPageData } from "@/public/page-data";

// GET /api/v1/pages/individuals/:slug: the individual page's data
// (ADR 0014), or 404 where the page would be missing.

export const dynamic = "force-dynamic";

export const GET = slugPageData(
  individualPage,
  "No public profile has this address.",
);
