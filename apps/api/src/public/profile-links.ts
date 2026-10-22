export type ProfileLink = { label: string; url: string };

/** An address in a form that ignores differences that do not change the page. */
function comparable(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

/**
 * A profile's links as visitors see them: the admin's links in their order,
 * each address once, then the Wikidata item unless a link already goes there.
 */
export function profileLinks(
  links: ProfileLink[],
  wikidataId: string | null,
): ProfileLink[] {
  const all = wikidataId
    ? [
        ...links,
        {
          label: "Wikidata",
          url: `https://www.wikidata.org/wiki/${wikidataId}`,
        },
      ]
    : links;
  const seen = new Set<string>();
  return all.filter((link) => {
    const key = comparable(link.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
