import {
  type ErrorReportingConfig,
  scrubErrorEvent,
  type ScrubbableEvent,
} from "@countrytopics/observability";

// Browsers send their error reports to the site (/api/v1/errors), which
// passes them on to Sentry (ADR 0012). Sentry then sees the site's address,
// not the visitor's, and the browser never needs the project's DSN. Reports
// come in Sentry's envelope format: a JSON header line, then items, each a
// JSON header line and a payload. Only error events are passed on, scrubbed
// again here so nothing depends on the browser having done it.

/** Larger envelopes are refused unread. */
export const ERROR_ENVELOPE_MAX_BYTES = 200 * 1_024;

const NEWLINE = 0x0a;
const decoder = new TextDecoder();

type Item = { header: Record<string, unknown>; payload: Uint8Array };

function objectFrom(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The envelope's header and items, or null when it is not one. */
export function parseEnvelope(
  bytes: Uint8Array,
): { header: Record<string, unknown>; items: Item[] } | null {
  let offset = 0;
  const line = (): Uint8Array => {
    const end = bytes.indexOf(NEWLINE, offset);
    const stop = end === -1 ? bytes.length : end;
    const slice = bytes.subarray(offset, stop);
    offset = stop + 1;
    return slice;
  };
  const header = objectFrom(decoder.decode(line()));
  if (!header) return null;
  const items: Item[] = [];
  while (offset < bytes.length) {
    const itemHeader = objectFrom(decoder.decode(line()));
    if (!itemHeader) return null;
    const length = itemHeader.length;
    let payload: Uint8Array;
    if (typeof length === "number") {
      if (!Number.isInteger(length) || length < 0) return null;
      if (offset + length > bytes.length) return null;
      payload = bytes.subarray(offset, offset + length);
      offset += length;
      if (bytes[offset] === NEWLINE) offset += 1;
    } else {
      payload = line();
    }
    items.push({ header: itemHeader, payload });
  }
  return { header, items };
}

/**
 * The envelope to send to Sentry for one from a browser: its error events
 * only, scrubbed, in the configured environment, addressed with the
 * site's DSN. Null when there is nothing to send.
 */
export function browserEnvelopeForSentry(
  bytes: Uint8Array,
  config: ErrorReportingConfig,
): string | null {
  const envelope = parseEnvelope(bytes);
  if (!envelope) return null;
  const events = envelope.items.flatMap((item) => {
    if (item.header.type !== "event") return [];
    const event = objectFrom(decoder.decode(item.payload));
    if (!event) return [];
    return [
      {
        ...scrubErrorEvent(event as ScrubbableEvent),
        environment: config.environment,
      },
    ];
  });
  if (events.length === 0) return null;
  const header = {
    ...(typeof envelope.header.event_id === "string"
      ? { event_id: envelope.header.event_id }
      : {}),
    sent_at: new Date().toISOString(),
    dsn: config.dsn.dsn,
  };
  return [
    JSON.stringify(header),
    ...events.flatMap((event) => [
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ]),
  ].join("\n");
}

/** Where Sentry takes envelopes for the configured project. */
export function sentryEnvelopeUrl(config: ErrorReportingConfig): string {
  return `https://${config.dsn.host}/api/${config.dsn.projectId}/envelope/`;
}
