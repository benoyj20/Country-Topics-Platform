/** Longer DOIs exist in theory, but anything this long is a paste mistake. */
export const DOI_MAX_LENGTH = 300;

// A registrant prefix ("10." and 4–9 digits), a slash, then any suffix. The
// suffix can contain almost any character, so only whitespace is refused.
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const DOI_PREFIXES = [/^https?:\/\/(dx\.)?doi\.org\//i, /^doi:\s*/i];

/**
 * A DOI in its canonical form (`10.1234/abc`, lowercase, because DOIs are
 * case-insensitive), from what an admin pasted: a bare DOI, `doi:10.…`, or a
 * `https://doi.org/…` link. Null when it is not a DOI.
 */
export function normalizeDoi(input: string): string | null {
  let value = input.trim();
  for (const prefix of DOI_PREFIXES) value = value.replace(prefix, "");
  if (/^https?:/i.test(value)) return null;
  try {
    // doi.org links percent-encode the suffix.
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  value = value.toLowerCase();
  // "." and ".." segments would change the path when the DOI is put into a
  // registry's URL; real DOIs do not use them.
  const pathTricks = value
    .split("/")
    .some((segment) => segment === "." || segment === "..");
  return value.length <= DOI_MAX_LENGTH &&
    DOI_PATTERN.test(value) &&
    !pathTricks
    ? value
    : null;
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(first9[index]) * (10 - index);
  }
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(first12[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * An ISBN as 13 digits without hyphens, from an ISBN-10 or ISBN-13 with or
 * without hyphens and spaces. Null when the check digit is wrong, which
 * catches most typing mistakes.
 */
export function normalizeIsbn(input: string): string | null {
  const value = input.replace(/^isbn(-1[03])?:?\s*/i, "").replace(/[\s-]/g, "");
  if (/^\d{9}[\dXx]$/.test(value)) {
    const first9 = value.slice(0, 9);
    if (isbn10CheckDigit(first9) !== value[9]?.toUpperCase()) return null;
    const first12 = `978${first9}`;
    return first12 + isbn13CheckDigit(first12);
  }
  if (/^97[89]\d{10}$/.test(value)) {
    return isbn13CheckDigit(value.slice(0, 12)) === value[12] ? value : null;
  }
  return null;
}
