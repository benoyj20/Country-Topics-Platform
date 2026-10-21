import { homePage } from "@/public/cached";
import { pageDataResponse } from "@/public/page-data";

// GET /api/v1/pages/home: the home page's data (ADR 0014).

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return pageDataResponse(() => homePage(), "The home page has no data.");
}
