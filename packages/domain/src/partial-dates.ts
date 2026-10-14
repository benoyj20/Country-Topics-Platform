const PARTIAL_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * A date known to the year, month, or day: `2019`, `2019-05`, or `2019-05-14`.
 * Dates about real people are stored only as precisely as the source states
 * them, never padded to a made-up day.
 */
export function isPartialDate(value: string): boolean {
  const match = PARTIAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  if (month === undefined) return true;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return false;
  if (day === undefined) return true;
  const daysInMonth = new Date(
    Date.UTC(Number(year), monthNumber, 0),
  ).getUTCDate();
  const dayNumber = Number(day);
  return dayNumber >= 1 && dayNumber <= daysInMonth;
}

/**
 * Whether a period from `start` to `end` is possible: compared at the coarser
 * precision of the two, so `2019` to `2019-03` is fine.
 */
export function isPartialDateRangeValid(start: string, end: string): boolean {
  const length = Math.min(start.length, end.length);
  return end.slice(0, length) >= start.slice(0, length);
}
