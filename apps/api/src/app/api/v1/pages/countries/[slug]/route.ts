import { countryPage } from "@/public/cached";
import { slugPageData } from "@/public/page-data";

// GET /api/v1/pages/countries/:slug: the country page's data (ADR 0014),
// or 404 where the page would be missing.

export const dynamic = "force-dynamic";

export const GET = slugPageData(countryPage, "No country has this address.");
