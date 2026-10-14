export const SLUG_MAX_LENGTH = 80;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Latin letters that Unicode decomposition leaves alone.
const LETTER_FALLBACKS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

/** Lowercase, without accents, with the letters above spelled out in ASCII. */
function foldLetters(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => LETTER_FALLBACKS[letter] ?? letter);
}

/**
 * A URL slug: lowercase ASCII words joined by hyphens, at most
 * `SLUG_MAX_LENGTH` characters. Empty when the text has no Latin letters or
 * digits (a name written only in another script needs a slug typed by hand).
 */
export function slugify(text: string): string {
  const slug = foldLetters(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}

export function isSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * The form used to find people entered twice: case, accents, punctuation, and
 * word order are ignored, so "José  Pérez-Díaz" and "Diaz, Jose Perez" match.
 * Any script works; only marks and punctuation are dropped.
 */
export function personNameKey(name: string): string {
  return foldLetters(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** A Wikidata item id such as `Q42`. */
export function isWikidataId(value: string): boolean {
  return /^Q[1-9][0-9]*$/.test(value);
}

/** An absolute `http:` or `https:` URL (no `javascript:` or `data:` links). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
