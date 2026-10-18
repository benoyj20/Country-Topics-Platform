/**
 * Links in comments (ADR 0010). Comments are plain text; addresses that
 * start with http://, https://, or www. are shown as links, and the same
 * rule counts them for the link limits. Bare domains ("example.com") stay
 * text and are not counted.
 */

/** Links one comment may hold. */
export const COMMENT_LINKS_MAX = 3;
/** Accounts younger than this may not post links. */
export const NEW_ACCOUNT_LINK_WAIT_MS = 3 * 24 * 60 * 60 * 1000;

export type CommentSegment = { text: string; href?: string };

// Starts after a space, punctuation, or the start of the text, never
// inside a word; runs to the next space or a character URLs escape.
const LINK_CANDIDATE =
  /(?<![\p{L}\p{N}_@./-])(?:https?:\/\/|www\.)[^\s<>"]+/giu;
const TRAILING = /[.,;:!?'"‘’“”*]$/u;
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Drops punctuation that ends a sentence rather than the address. */
function trimLink(candidate: string): string {
  let link = candidate;
  for (;;) {
    const last = link.at(-1) ?? "";
    const opener = CLOSERS[last];
    if (TRAILING.test(link)) link = link.slice(0, -1);
    else if (opener && count(link, last) > count(link, opener)) {
      link = link.slice(0, -1);
    } else return link;
  }
}

/** The address a link candidate opens, or null when it is not one. */
function hrefOf(link: string): string | null {
  const absolute = /^www\./i.test(link) ? `https://${link}` : link;
  try {
    const url = new URL(absolute);
    const host = url.hostname;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // "https://bank.example@evil.example" opens evil.example.
    if (url.username || url.password) return null;
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** A comment as text and links, in order, for showing it. */
export function commentSegments(body: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let from = 0;
  for (const match of body.matchAll(LINK_CANDIDATE)) {
    const link = trimLink(match[0]);
    const href = hrefOf(link);
    if (!href) continue;
    if (match.index > from) {
      segments.push({ text: body.slice(from, match.index) });
    }
    segments.push({ text: link, href });
    from = match.index + link.length;
  }
  if (from < body.length) segments.push({ text: body.slice(from) });
  return segments;
}

/** How many links a comment would show. */
export function commentLinkCount(body: string): number {
  return commentSegments(body).filter((segment) => segment.href).length;
}

/**
 * Why a comment's links cannot be posted, or null when they can. Staff
 * are appointed, so the wait for new accounts does not apply to them.
 */
export function commentLinkProblem({
  links,
  accountCreatedAt,
  staff,
  now = new Date(),
}: {
  links: number;
  accountCreatedAt: Date;
  staff: boolean;
  now?: Date;
}): string | null {
  if (links === 0) return null;
  if (links > COMMENT_LINKS_MAX) {
    return `A comment can hold at most ${COMMENT_LINKS_MAX} links.`;
  }
  const allowedFrom = new Date(
    accountCreatedAt.getTime() + NEW_ACCOUNT_LINK_WAIT_MS,
  );
  if (!staff && now < allowedFrom) {
    const day = allowedFrom.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return `New accounts can post links from ${day} (UTC), ${NEW_ACCOUNT_LINK_WAIT_MS / 86_400_000} days after joining. Remove the link to post now.`;
  }
  return null;
}
