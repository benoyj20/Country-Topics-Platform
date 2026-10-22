import { isAllowedLinkUrl } from "@countrytopics/domain";

/**
 * A stored address as a link: web and email addresses, and this site's own
 * paths (such as a file's /files/...). Anything else, which a draft may hold
 * since drafts are not checked, is shown as text instead.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  // A path, but not "//host" or "/\host", which browsers read as another site.
  if (url.startsWith("/") && url[1] !== "/" && url[1] !== "\\") return url;
  return isAllowedLinkUrl(url) ? url : undefined;
}
