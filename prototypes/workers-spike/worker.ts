import {
  ERROR_REPORTING_DEFAULTS,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@countrytopics/observability";
import * as Sentry from "@sentry/cloudflare";

// @ts-expect-error: built by `opennextjs-cloudflare build`.
import handler from "./.open-next/worker.js";

// OpenNext's Worker, wrapped so errors reach Sentry (ADR 0012), with the
// queue that revalidates pages in the background exported beside it.
// @ts-expect-error: built by `opennextjs-cloudflare build`.
export { DOQueueHandler } from "./.open-next/worker.js";

// Sentry's Cloudflare SDK sends the request's cookies and a user even
// without sendDefaultPii, so reports go through the site's own scrubbing.
const { sendDefaultPii: _unused, ...defaults } = ERROR_REPORTING_DEFAULTS;

export default Sentry.withSentry(
  (env: CloudflareEnv) => ({
    ...defaults,
    dsn: env.SENTRY_DSN,
    environment: "spike",
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  }),
  handler,
);
