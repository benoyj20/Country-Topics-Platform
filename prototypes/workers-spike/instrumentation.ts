import { captureException } from "@sentry/cloudflare";

// Errors Next.js catches while answering a request. Sentry itself is set up
// per request by worker.ts.
export function onRequestError(error: unknown): void {
  captureException(error);
}
