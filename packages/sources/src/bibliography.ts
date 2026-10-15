import { isPartialDate, type ReferenceKind } from "@countrytopics/domain";
import * as z from "zod";

import {
  requestJson,
  type SourceClient,
  SourceUnavailableError,
} from "./http.ts";

/**
 * What a registry says about a DOI or ISBN, used to fill in a reference.
 * Every field comes from the registry's record; nothing is guessed.
 */
export type ReferenceMetadata = {
  source: "Crossref" | "doi.org" | "Open Library";
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

/** A 200 response in an unexpected shape means the service changed, not that the record is missing. */
function parseOrUnavailable<T>(
  schema: z.ZodType<T>,
  body: unknown,
  source: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SourceUnavailableError(
      source,
      "sent a response in an unexpected format",
    );
  }
  return parsed.data;
}

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

function doiPath(doi: string): string {
  return doi.split("/").map(encodeURIComponent).join("/");
}

export function createBibliography(client: SourceClient): Bibliography {
  async function crossref(doi: string): Promise<LookupResult> {
    const { status, body } = await requestJson(
      client,
      "Crossref",
      `https://api.crossref.org/works/${doiPath(doi)}`,
    );
    // 404 for unknown DOIs; other 4xx for malformed ones.
    if (status !== 200) return { found: false };
    const work = parseOrUnavailable(crossrefWork, body, "Crossref").message;
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
    // Google Books would widen coverage, but without an API key it shares
    // one daily quota with every caller and is usually refused (ADR 0005).
    lookupIsbn: openLibrary,
  };
}
