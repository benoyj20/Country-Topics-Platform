import config from "@payload-config";
import { getPayload } from "payload";

import { checkHealth, payloadHealthDependencies } from "@/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const payload = await getPayload({ config });
  const status = await checkHealth(payloadHealthDependencies(payload));
  return Response.json(
    { status },
    {
      status: status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
