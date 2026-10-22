import {
  CLAIM_STANCES,
  LICENCES,
  REFERENCE_KINDS,
  TOPIC_CHANGE_KINDS,
  TOPIC_PERSON_ROLES,
  type TranscriptSegment as DomainTranscriptSegment,
} from "@countrytopics/domain";
import * as z from "zod";

// What the public pages show, as the backend serves it at
// /api/v1/pages/* and /api/v1/topics (ADR 0014): plain values picked field
// by field from the records, so nothing staff-only (editors, check
// details, drafts, pasted transcripts) can reach a page by accident.
//
// Parsing drops any field a schema does not list, so the backend, which
// deploys apart from the frontend, can add a field before the frontend
// uses it. The backend's tests check that what it sends parses unchanged,
// so a field it starts sending by mistake fails there.

export const CountryLink = z.object({
  name: z.string(),
  slug: z.string(),
});
export type CountryLink = z.infer<typeof CountryLink>;
export const IndividualLink = z.object({
  name: z.string(),
  slug: z.string(),
});
export type IndividualLink = z.infer<typeof IndividualLink>;
export const TermLink = z.object({ name: z.string(), slug: z.string() });
export type TermLink = z.infer<typeof TermLink>;

/** The states a published topic can be in. */
export const PUBLIC_TOPIC_STATES = [
  "published",
  "updated",
  "archived",
] as const;
export const PublicTopicState = z.enum(PUBLIC_TOPIC_STATES);
export type PublicTopicState = z.infer<typeof PublicTopicState>;

const topicSummaryFields = {
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  state: PublicTopicState,
  firstPublishedAt: z.string().nullable(),
  lastPublishedAt: z.string().nullable(),
  countries: z.array(CountryLink),
};
export const TopicSummary = z.object(topicSummaryFields);
export type TopicSummary = z.infer<typeof TopicSummary>;

/** A list that stops at a limit; `more` says whether anything was left out. */
export function LimitedList<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), more: z.boolean() });
}
export type LimitedList<T> = { items: T[]; more: boolean };

export const PublicFile = z.object({
  /** Served by /files/[id]. */
  url: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  filesize: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string(),
  licence: z.enum(LICENCES),
  credit: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /**
   * Where an image's subject is, in percent from its left and top edges:
   * a cropped image keeps it in view. Null for documents and for images
   * whose focal point was never set.
   */
  focalX: z.number().nullable(),
  focalY: z.number().nullable(),
});
export type PublicFile = z.infer<typeof PublicFile>;

export const TranscriptSegment = z.object({
  start_s: z.number(),
  end_s: z.number(),
  text: z.string(),
}) satisfies z.ZodType<DomainTranscriptSegment>;

export const PublicSnippet = z.object({
  youtubeId: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  caption: z.string(),
  speaker: IndividualLink.nullable(),
  language: z.string(),
  segments: z.array(TranscriptSegment),
  videoTitle: z.string().nullable(),
  channel: z.string().nullable(),
  /** Why YouTube no longer plays the video here; null while it plays. */
  videoUnavailable: z.string().nullable(),
});
export type PublicSnippet = z.infer<typeof PublicSnippet>;

const evidenceFields = {
  title: z.string().nullable(),
  note: z.string().nullable(),
};

export const PublicEvidence = z.discriminatedUnion("kind", [
  z.object({
    ...evidenceFields,
    kind: z.literal("snippet"),
    snippet: PublicSnippet,
  }),
  z.object({
    ...evidenceFields,
    kind: z.enum(["image", "document"]),
    file: PublicFile,
  }),
  z.object({
    ...evidenceFields,
    kind: z.literal("link"),
    url: z.string(),
    /** The Wayback Machine copy the worker found or saved. */
    archive: z
      .object({ url: z.string(), capturedAt: z.string().nullable() })
      .nullable(),
    /** A copy elsewhere, added by an admin. */
    otherArchiveUrl: z.string().nullable(),
  }),
]);
export type PublicEvidence = z.infer<typeof PublicEvidence>;

export const PublicReference = z.object({
  kind: z.enum(REFERENCE_KINDS),
  title: z.string(),
  authors: z.array(z.string()),
  containerTitle: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedDate: z.string().nullable(),
  doi: z.string().nullable(),
  isbn: z.string().nullable(),
  url: z.string().nullable(),
});
export type PublicReference = z.infer<typeof PublicReference>;

export const CitedReference = z.object({
  stance: z.enum(CLAIM_STANCES),
  passage: z.string(),
  locator: z.string().nullable(),
  reference: PublicReference,
});
export type CitedReference = z.infer<typeof CitedReference>;

/** A reference a profile cites for its own statements about the person. */
export const ProfileSource = z.object({
  passage: z.string(),
  locator: z.string().nullable(),
  reference: PublicReference,
});
export type ProfileSource = z.infer<typeof ProfileSource>;

/** A statement on a profile, with the evidence and sources that back it. */
export const ProfileStatement = z.object({
  text: z.string(),
  evidence: z.array(PublicEvidence),
  sources: z.array(ProfileSource),
});
export type ProfileStatement = z.infer<typeof ProfileStatement>;

export const TopicChangeEntry = z.object({
  kind: z.enum(TOPIC_CHANGE_KINDS),
  note: z.string(),
  date: z.string(),
});
export type TopicChangeEntry = z.infer<typeof TopicChangeEntry>;

/** A rich-text body as Payload's editor saves it: Lexical's JSON. */
export type RichTextBody = {
  root: {
    type: string;
    children: { type: string; version: number; [key: string]: unknown }[];
    direction: "ltr" | "rtl" | null;
    format: "left" | "start" | "center" | "right" | "end" | "justify" | "";
    indent: number;
    version: number;
  };
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DIRECTIONS = new Set(["ltr", "rtl", null]);
const FORMATS = new Set([
  "left",
  "start",
  "center",
  "right",
  "end",
  "justify",
  "",
]);

/**
 * Lexical's JSON is checked at its root and its top-level nodes' type: the
 * site's renderer handles the nodes, and drops those it does not know.
 */
export const RichTextBody = z.custom<RichTextBody>(
  (value) =>
    isRecord(value) &&
    isRecord(value.root) &&
    typeof value.root.type === "string" &&
    DIRECTIONS.has(value.root.direction as string | null) &&
    FORMATS.has(value.root.format as string) &&
    typeof value.root.indent === "number" &&
    typeof value.root.version === "number" &&
    Array.isArray(value.root.children) &&
    value.root.children.every(
      (child) =>
        isRecord(child) &&
        typeof child.type === "string" &&
        typeof child.version === "number",
    ),
  { message: "A rich-text body has a root with its children." },
);

export const TopicPage = z.object({
  ...topicSummaryFields,
  category: TermLink.nullable(),
  tags: z.array(TermLink),
  people: z.array(
    z.object({
      individual: IndividualLink,
      role: z.enum(TOPIC_PERSON_ROLES),
    }),
  ),
  body: RichTextBody,
  /** Page addresses of the topics and individuals the body links to, by "collection:id"; links to anything not public are absent. */
  bodyLinks: z.record(z.string(), z.string()),
  evidence: z.array(PublicEvidence),
  references: z.array(CitedReference),
  changes: z.array(TopicChangeEntry),
});
export type TopicPage = z.infer<typeof TopicPage>;

export const IndividualPage = z.object({
  name: z.string(),
  slug: z.string(),
  aliases: z.array(z.string()),
  photo: PublicFile.nullable(),
  /** The admin's links, each address once, ending with the Wikidata item. */
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  /** The profile's statements that are backed; the others are left out. */
  statements: z.array(ProfileStatement),
  topics: LimitedList(TopicSummary),
});
export type IndividualPage = z.infer<typeof IndividualPage>;

export const CountryPage = z.object({
  name: z.string(),
  slug: z.string(),
  region: z.string().nullable(),
  subregion: z.string().nullable(),
  topics: LimitedList(TopicSummary),
  /** The individuals the listed topics name, by name. */
  people: z.array(IndividualLink),
});
export type CountryPage = z.infer<typeof CountryPage>;

export const HomePage = z.object({
  topics: LimitedList(TopicSummary),
  /** Countries with at least one listed topic, by name. */
  countries: z.array(CountryLink),
});
export type HomePage = z.infer<typeof HomePage>;

/** A listed topic in browse results. */
export const BrowseTopic = z.object({
  ...topicSummaryFields,
  referenceCount: z.number(),
  commentCount: z.number(),
});
export type BrowseTopic = z.infer<typeof BrowseTopic>;

/** One value of a browse facet. */
export const BrowseFacetValue = z.object({
  /** The slug or code that goes in the URL. */
  value: z.string(),
  label: z.string(),
  /**
   * The topics choosing it would show, given the other filters; null for a
   * chosen value outside the most common ones, which are the ones counted.
   */
  count: z.number().nullable(),
  /** A country's region, to group countries by. */
  group: z.string().nullable(),
});
export type BrowseFacetValue = z.infer<typeof BrowseFacetValue>;

export const BrowseFacets = z.object({
  country: z.array(BrowseFacetValue),
  category: z.array(BrowseFacetValue),
  tag: z.array(BrowseFacetValue),
  person: z.array(BrowseFacetValue),
  evidence: z.array(BrowseFacetValue),
  language: z.array(BrowseFacetValue),
  /** Topics citing a reference, given the other filters. */
  references: z.number(),
});
export type BrowseFacets = z.infer<typeof BrowseFacets>;

/** A page of browse results; the first page also has the total and facets. */
export const BrowseResult = z.object({
  topics: z.array(BrowseTopic),
  nextCursor: z.string().nullable(),
  total: z.number().nullable(),
  facets: BrowseFacets.nullable(),
});
export type BrowseResult = z.infer<typeof BrowseResult>;

/** The answer to a page-data request for something that is not public. */
export const PageNotFound = z.object({ error: z.string() });
export type PageNotFound = z.infer<typeof PageNotFound>;
