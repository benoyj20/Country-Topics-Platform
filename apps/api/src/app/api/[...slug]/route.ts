// Payload's REST API (ADR 0014: the admin and the frontend use it; the
// collections' access rules decide what each request may do). Payload
// generated this file with its admin panel, which phase 12 removed, along
// with the panel's styles this file once loaded.
import config from "@payload-config";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
