import { passThrough } from "@/pass-through";
import { frontendSettings } from "@/settings";

// Every address the frontend does not answer itself goes on to the backend
// (pass-through.ts), whatever the method.

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
