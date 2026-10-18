import { accountExport } from "@/account/export";
import { apiError, NO_STORE } from "@/api/json";
import { rateLimited, refundRateLimited, requestProfile } from "@/api/member";
import { writePool } from "@/write-pool";

// GET /api/v1/account/export: the signed-in member's data as a JSON file
// (ADR 0011). Personal, so never cached. Another site could not read it,
// but a link there could use up the member's daily exports, so requests
// the browser marks as coming from elsewhere are refused.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") {
    return apiError(403, "Download your data from your account page.");
  }
  const profile = await requestProfile(request);
  if (!profile) return apiError(401, "Sign in to download your data.");
  const limited = await rateLimited("data-export", profile.id);
  if (limited) return limited;
  try {
    const data = await accountExport(await writePool(), profile);
    const day = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="country-topics-data-${day}.json"`,
      },
    });
  } catch (error) {
    console.error(
      "Data export failed:",
      error instanceof Error ? error.message : error,
    );
    await refundRateLimited("data-export", profile.id);
    return apiError(
      503,
      "Your data could not be gathered right now. Try again in a moment.",
    );
  }
}
