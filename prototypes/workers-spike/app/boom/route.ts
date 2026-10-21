// Throws, to see that errors reach Sentry from the Worker.
export function GET(): Response {
  throw new Error("TEST: Workers spike error report");
}
