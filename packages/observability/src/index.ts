// Error reporting to Sentry (ADR 0012), shared by the site and the worker.
// Reports carry what is needed to fix a fault and as little about people as
// possible: no cookies, request bodies, query strings, users, or email
// addresses. These are plain functions over the event's shape, so they
// work with any Sentry SDK and are tested without one.

/** Options every Sentry SDK in the project starts from. */
export const ERROR_REPORTING_DEFAULTS = {
  // No IP addresses, cookies, or user details from the SDK itself.
  sendDefaultPii: false,
  // Errors only: no performance traces, profiles, or session replays.
  tracesSampleRate: 0,
  maxBreadcrumbs: 20,
} as const;

/** SENTRY_ENVIRONMENT when unset: errors from development, not the pilot. */
export const DEFAULT_ERROR_ENVIRONMENT = "development";
const ENVIRONMENT_PATTERN = /^[a-z0-9-]{1,64}$/;

export type SentryDsn = {
  dsn: string;
  /** Where its events go, such as `o1.ingest.us.sentry.io`. */
  host: string;
  projectId: string;
};

/** A Sentry DSN, or null when `value` is not one. */
export function parseSentryDsn(value: string): SentryDsn | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  const projectId = /^\/(\d+)$/.exec(url.pathname)?.[1];
  if (url.protocol !== "https:" || !url.username || !projectId) return null;
  return { dsn: value, host: url.host, projectId };
}

export type ErrorReportingConfig = { dsn: SentryDsn; environment: string };

/**
 * Error reporting from SENTRY_DSN and SENTRY_ENVIRONMENT: off (undefined)
 * without a DSN. Problems name the variable, never its value.
 */
export function readErrorReporting(
  env: Record<string, string | undefined>,
  problems: string[],
): ErrorReportingConfig | undefined {
  const value = env.SENTRY_DSN?.trim() ?? "";
  const environment =
    env.SENTRY_ENVIRONMENT?.trim() || DEFAULT_ERROR_ENVIRONMENT;
  if (!ENVIRONMENT_PATTERN.test(environment)) {
    problems.push(
      "SENTRY_ENVIRONMENT must be lowercase letters, digits, and hyphens, such as pilot",
    );
  }
  if (!value) return undefined;
  const dsn = parseSentryDsn(value);
  if (!dsn) {
    problems.push(
      "SENTRY_DSN must be empty or the project's DSN from Sentry (https://...@...sentry.io/<project>)",
    );
    return undefined;
  }
  return { dsn, environment };
}

const EMAIL_PATTERN = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;

/** Text with email addresses replaced. */
export function withoutEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, "[email]");
}

/** A URL without its query and fragment, which can hold search terms or tokens. */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? "";
}

/** The parts of a Sentry event these functions read and change. */
export type ScrubbableEvent = {
  message?: string;
  user?: unknown;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
  };
  exception?: { values?: { value?: string }[] };
  /** Free-form data, such as the arguments console capture attaches. */
  extra?: Record<string, unknown>;
  logentry?: { message?: string; params?: unknown[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
};

export type ScrubbableBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

const KEPT_HEADERS = new Set(["user-agent"]);
// Page changes and requests the site made; console output and clicks can
// hold what people typed.
const KEPT_BREADCRUMBS = new Set(["navigation", "fetch", "xhr", "http"]);

/** A breadcrumb with its addresses' queries removed, or null to drop it. */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(
  breadcrumb: T,
): T | null {
  if (!breadcrumb.category || !KEPT_BREADCRUMBS.has(breadcrumb.category)) {
    return null;
  }
  const data = { ...breadcrumb.data };
  for (const key of ["url", "from", "to"]) {
    const value = data[key];
    if (typeof value === "string") data[key] = withoutQuery(value);
  }
  return { ...breadcrumb, message: undefined, data };
}

const NESTING_LIMIT = 5;

/** Strings anywhere in `value` with email addresses replaced. */
export function withoutEmailsDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return withoutEmails(value);
  if (depth >= NESTING_LIMIT || typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => withoutEmailsDeep(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      withoutEmailsDeep(item, depth + 1),
    ]),
  );
}

/** The event with everything about people that it need not carry removed. */
export function scrubErrorEvent<T extends ScrubbableEvent>(event: T): T {
  const scrubbed: T = { ...event, user: undefined };
  if (event.message) scrubbed.message = withoutEmails(event.message);
  if (event.extra) {
    scrubbed.extra = withoutEmailsDeep(event.extra) as Record<string, unknown>;
  }
  if (event.request) {
    const headers = Object.fromEntries(
      Object.entries(event.request.headers ?? {}).filter(([name]) =>
        KEPT_HEADERS.has(name.toLowerCase()),
      ),
    );
    scrubbed.request = {
      url: event.request.url ? withoutQuery(event.request.url) : undefined,
      headers,
    };
  }
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((value) => ({
        ...value,
        value: value.value ? withoutEmails(value.value) : value.value,
      })),
    };
  }
  if (event.logentry) {
    scrubbed.logentry = {
      message: event.logentry.message
        ? withoutEmails(event.logentry.message)
        : event.logentry.message,
      params: event.logentry.params?.map((param) =>
        typeof param === "string" ? withoutEmails(param) : param,
      ),
    };
  }
  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.flatMap((breadcrumb) => {
      const kept = scrubBreadcrumb(breadcrumb);
      return kept ? [kept] : [];
    });
  }
  return scrubbed;
}
