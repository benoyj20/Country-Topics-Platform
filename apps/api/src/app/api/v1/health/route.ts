import config from "@payload-config";
import { getPayload } from "payload";

import { checkHealth, payloadHealthDependencies } from "@/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const status = await checkHealth(
    payloadHealthDependencies(() => getPayload({ config })),
  );
  return Response.json(
    { status },
    {
      status: status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
