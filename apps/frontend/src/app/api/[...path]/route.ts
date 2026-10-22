import { passThrough } from "@/pass-through";
import { frontendSettings } from "@/settings";

// /api/* goes on to the backend (pass-through.ts), whatever the method:
// sign-in, the member API, page data, and Payload's REST API.

export const dynamic = "force-dynamic";

function handle(request: Request): Promise<Response> {
  return passThrough(request, frontendSettings());
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
