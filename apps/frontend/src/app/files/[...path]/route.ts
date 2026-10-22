import { passThrough } from "@/pass-through";
import { frontendSettings } from "@/settings";

// /files/:id, the staff's uploads, comes from the backend (pass-through.ts)
// with its own cache headers.

export const dynamic = "force-dynamic";

function handle(request: Request): Promise<Response> {
  return passThrough(request, frontendSettings());
}

export const GET = handle;
export const HEAD = handle;
