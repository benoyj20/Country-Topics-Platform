import {
  ERROR_REPORTING_DEFAULTS,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@countrytopics/observability";
import * as Sentry from "@sentry/cloudflare";

// Built by `opennextjs-cloudflare build`; this file is left out of
// tsconfig.json because that build does not exist until then.
import handler from "./.open-next/worker.js";

// OpenNext's Worker, wrapped so errors reach Sentry (ADR 0012), with the
// queue that revalidates pages in the background exported beside it.
export { DOQueueHandler } from "./.open-next/worker.js";

export default Sentry.withSentry(
  (env: CloudflareEnv) => ({
    ...ERROR_REPORTING_DEFAULTS,
    dsn: env.SENTRY_DSN,
    environment: "spike",
    beforeSend: (event) => scrubErrorEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  }),
  handler,
);
