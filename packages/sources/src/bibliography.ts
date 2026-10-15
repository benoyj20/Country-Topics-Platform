import {
  isPartialDate,
  normalizeIsbn,
  type ReferenceKind,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  parseOrUnavailable,
  requestJson,
  type SourceClient,
  SourceUnavailableError,
} from "./http.ts";

/**
 * What a registry says about a DOI or ISBN, used to fill in a reference.
 * Every field comes from the registry's record; nothing is guessed.
 */
export type ReferenceMetadata = {
  source: "Crossref" | "doi.org" | "Open Library" | "Google Books";
  kind?: ReferenceKind;
  title?: string;
  authors: string[];
  /** The journal, book, or website the work appeared in. */
  containerTitle?: string;
  publisher?: string;
  /** As precise as the record: YYYY, YYYY-MM, or YYYY-MM-DD. */
  publishedDate?: string;
};

export type LookupResult =
  { found: true; metadata: ReferenceMetadata } | { found: false };

/** Looks up DOIs and ISBNs. Throws SourceUnavailableError when it cannot tell. */
export type Bibliography = {
  lookupDoi(doi: string): Promise<LookupResult>;
  lookupIsbn(isbn: string): Promise<LookupResult>;
};

const CROSSREF_KINDS: Record<string, ReferenceKind> = {
  "journal-article": "article",
  "proceedings-article": "article",
  "posted-content": "article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  report: "report",
  "report-component": "report",
  dataset: "dataset",
};

const crossrefWork = z.object({
  message: z.object({
    DOI: z.string(),
    type: z.string().optional(),
    title: z.array(z.string()).optional(),
    subtitle: z.array(z.string()).optional(),
    author: z
      .array(
        z.object({
          given: z.string().optional(),
          family: z.string().optional(),
          name: z.string().optional(),
        }),
      )
      .optional(),
    "container-title": z.array(z.string()).optional(),
    publisher: z.string().optional(),
    issued: z
      .object({
        "date-parts": z.array(z.array(z.number().nullable())).optional(),
      })
      .optional(),
  }),
});

const doiHandle = z.object({ responseCode: z.number() });

const openLibraryRecords = z.record(z.string(), z.unknown());

const openLibraryBook = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  authors: z.array(z.object({ name: z.string() })).optional(),
  publishers: z.array(z.object({ name: z.string() })).optional(),
  publish_date: z.string().optional(),
});

const googleBooksVolumes = z.object({
  items: z
    .array(
      z.object({
        volumeInfo: z.object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          authors: z.array(z.string()).optional(),
          publisher: z.string().optional(),
          publishedDate: z.string().optional(),
          industryIdentifiers: z
            .array(z.object({ type: z.string(), identifier: z.string() }))
            .optional(),
        }),
      }),
    )
    .optional(),
});

export type BibliographyOptions = {
  /**
   * Turns on Google Books as a backup for ISBNs Open Library does not know.
   * Without a key Google shares one daily quota with every caller.
   */
  googleBooksApiKey?: string;
  /** Told when the Google Books backup fails, so a bad key gets noticed. */
  onBackupError?: (message: string) => void;
};

/** Crossref titles can contain JATS or HTML markup, such as <i>. */
function plainText(value: string | undefined): string | undefined {
  const text = value
    ?.replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function joinTitle(title?: string, subtitle?: string): string | undefined {
  const main = plainText(title);
  const sub = plainText(subtitle);
  return main && sub ? `${main}: ${sub}` : main;
}

function dateFromParts(
  parts: (number | null)[] | undefined,
): string | undefined {
  const [year, month, day] = parts ?? [];
  if (!year) return undefined;
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = [String(year), month && pad(month), month && day && pad(day)]
    .filter(Boolean)
    .join("-");
  return isPartialDate(date) ? date : String(year);
}

/** A free-text publication date ("May 2004", "2004-05-01") at the precision it states. */
function dateFromText(text: string | undefined): string | undefined {
  const value = text?.trim();
  if (!value) return undefined;
  if (isPartialDate(value)) return value;
  const year = /\b(\d{4})\b/.exec(value)?.[1];
  return year;
}

/**
 * The DOI as URL path segments. "." and ".." segments are encoded too, or the
 * URL parser would resolve them and ask about a different DOI.
 */
function doiPath(doi: string): string {
  return doi
    .split("/")
    .map((segment) =>
      segment === "." || segment === ".."
        ? "%2E".repeat(segment.length)
        : encodeURIComponent(segment),
    )
    .join("/");
}

export function createBibliography(
  client: SourceClient,
  { googleBooksApiKey, onBackupError }: BibliographyOptions = {},
): Bibliography {
  async function crossref(doi: string): Promise<LookupResult> {
    const { status, body } = await requestJson(
      client,
      "Crossref",
      `https://api.crossref.org/works/${doiPath(doi)}`,
    );
    // 404 for unknown DOIs; other 4xx for malformed ones.
    if (status !== 200) return { found: false };
    const work = parseOrUnavailable(crossrefWork, body, "Crossref").message;
    // Only a record for the DOI asked about counts.
    if (work.DOI.toLowerCase() !== doi) return { found: false };
    return {
      found: true,
      metadata: {
        source: "Crossref",
        kind: work.type ? (CROSSREF_KINDS[work.type] ?? "other") : undefined,
        title: joinTitle(work.title?.[0], work.subtitle?.[0]),
        authors: (work.author ?? []).flatMap((author) => {
          const name =
            plainText(author.name) ??
            plainText([author.given, author.family].filter(Boolean).join(" "));
          return name ? [name] : [];
        }),
        containerTitle: plainText(work["container-title"]?.[0]),
        publisher: plainText(work.publisher),
        publishedDate: dateFromParts(work.issued?.["date-parts"]?.[0]),
      },
    };
  }

  // DOIs from other registration agencies (DataCite, mEDRA, …) are not in
  // Crossref; the DOI system itself says whether they exist.
  async function doiSystem(doi: string): Promise<LookupResult> {
    const { status, body } = await requestJson(
      client,
      "doi.org",
      `https://doi.org/api/handles/${doiPath(doi)}`,
    );
    if (status !== 200) return { found: false };
    const handle = parseOrUnavailable(doiHandle, body, "doi.org");
    // Response code 1 means the handle exists.
    return handle.responseCode === 1
      ? { found: true, metadata: { source: "doi.org", authors: [] } }
      : { found: false };
  }

  async function openLibrary(isbn: string): Promise<LookupResult> {
    const key = `ISBN:${isbn}`;
    const { status, body } = await requestJson(
      client,
      "Open Library",
      `https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`,
    );
    if (status !== 200) return { found: false };
    // An unknown ISBN gives an empty object.
    const records = parseOrUnavailable(
      openLibraryRecords,
      body,
      "Open Library",
    );
    if (records[key] === undefined) return { found: false };
    const book = parseOrUnavailable(
      openLibraryBook,
      records[key],
      "Open Library",
    );
    return {
      found: true,
      metadata: {
        source: "Open Library",
        kind: "book",
        title: joinTitle(book.title, book.subtitle),
        authors: (book.authors ?? []).map((author) => author.name),
        publisher: book.publishers?.[0]?.name,
        publishedDate: dateFromText(book.publish_date),
      },
    };
  }

  /**
   * Google Books, as a best-effort backup. Its ISBN search often finds
   * nothing and it often answers 503 (tried 15 October 2026), so only an
   * exact ISBN match counts and any failure means "no answer".
   */
  async function googleBooks(isbn: string): Promise<LookupResult | null> {
    if (!googleBooksApiKey) return null;
    try {
      // The key goes in a header, so it never appears in logged URLs. A plain
      // search finds more than "isbn:"; the exact match is checked below.
      const { status, body } = await requestJson(
        client,
        "Google Books",
        `https://www.googleapis.com/books/v1/volumes?q=${isbn}&maxResults=20`,
        { headers: { "X-goog-api-key": googleBooksApiKey } },
      );
      if (status !== 200) {
        throw new SourceUnavailableError("Google Books", `answered ${status}`);
      }
      const volumes = parseOrUnavailable(
        googleBooksVolumes,
        body,
        "Google Books",
      );
      const volume = volumes.items?.find((item) =>
        item.volumeInfo.industryIdentifiers?.some(
          (id) => normalizeIsbn(id.identifier) === isbn,
        ),
      )?.volumeInfo;
      if (!volume) return { found: false };
      return {
        found: true,
        metadata: {
          source: "Google Books",
          kind: "book",
          title: joinTitle(volume.title, volume.subtitle),
          authors: volume.authors ?? [],
          publisher: volume.publisher,
          publishedDate: dateFromText(volume.publishedDate),
        },
      };
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      onBackupError?.(error.message);
      return null;
    }
  }

  return {
    async lookupDoi(doi) {
      // The DOI system is the authority on whether a DOI exists, so it also
      // answers when Crossref is down; Crossref adds the details.
      try {
        const result = await crossref(doi);
        if (result.found) return result;
      } catch (error) {
        if (!(error instanceof SourceUnavailableError)) throw error;
      }
      return doiSystem(doi);
    },
    // Open Library first. Google Books, when configured, can only turn a
    // "not found" or an outage into a found book; it never makes it worse.
    async lookupIsbn(isbn) {
      let outage: SourceUnavailableError | null = null;
      try {
        const result = await openLibrary(isbn);
        if (result.found) return result;
      } catch (error) {
        if (!(error instanceof SourceUnavailableError)) throw error;
        outage = error;
      }
      const backup = await googleBooks(isbn);
      if (backup?.found) return backup;
      if (outage) throw outage;
      return { found: false };
    },
  };
}
