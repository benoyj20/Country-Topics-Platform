import { isPartialDate } from "@countrytopics/domain";

// Dates are shown in UTC, so the server's and the visitor's time zones do not
// change what a cached page says.
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "17 October 2026" for a stored timestamp. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date);
}

/** "2024", "May 2024", or "3 May 2024": only as precise as the source. */
export function formatPartialDate(value: string): string {
  if (!isPartialDate(value)) return value;
  const [year, month, day] = value.split("-");
  if (!month) return year ?? value;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day ?? 1)),
  );
  return day ? DAY.format(date) : MONTH.format(date);
}

/** "1 reference", "3 comments", "-1 point". */
export function counted(count: number, noun: string): string {
  return `${count} ${Math.abs(count) === 1 ? noun : `${noun}s`}`;
}

const KB = 1024;

/** "840 KB", "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < KB * KB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}
