import type {
  ClaimStance,
  ReferenceKind,
  TopicPersonRole,
  TranscriptSegment,
} from "@countrytopics/domain";

import type { Licence } from "@/content-labels";
import type { Topic } from "@/payload-types";

// What the public pages show: plain values picked field by field from the
// records, so nothing staff-only (editors, check details, drafts, pasted
// transcripts) can reach a page by accident. Every type is JSON, because the
// data is cached between requests.

export type CountryLink = { name: string; slug: string };
export type IndividualLink = { name: string; slug: string };
export type TermLink = { name: string; slug: string };

/** The states a published topic can be in. */
export type PublicTopicState = "published" | "updated" | "archived";

export type TopicSummary = {
  slug: string;
  title: string;
  summary: string;
  state: PublicTopicState;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  countries: CountryLink[];
};

/** A list that stops at a limit; `more` says whether anything was left out. */
export type LimitedList<T> = { items: T[]; more: boolean };

export type PublicFile = {
  /** Served by /files/[id]. */
  url: string;
  filename: string;
  mimeType: string;
  filesize: number | null;
  width: number | null;
  height: number | null;
  alt: string;
  licence: Licence;
  credit: string | null;
  sourceUrl: string | null;
};

export type PublicSnippet = {
  youtubeId: string;
  start_s: number;
  end_s: number;
  caption: string;
  speaker: IndividualLink | null;
  language: string;
  segments: TranscriptSegment[];
  videoTitle: string | null;
  channel: string | null;
  /** Why YouTube no longer plays the video here; null while it plays. */
  videoUnavailable: string | null;
};

type EvidenceBase = { title: string | null; note: string | null };

export type PublicEvidence =
  | (EvidenceBase & { kind: "snippet"; snippet: PublicSnippet })
  | (EvidenceBase & { kind: "image" | "document"; file: PublicFile })
  | (EvidenceBase & {
      kind: "link";
      url: string;
      /** The Wayback Machine copy the worker found or saved. */
      archive: { url: string; capturedAt: string | null } | null;
      /** A copy elsewhere, added by an admin. */
      otherArchiveUrl: string | null;
    });

export type PublicReference = {
  kind: ReferenceKind;
  title: string;
  authors: string[];
  containerTitle: string | null;
  publisher: string | null;
  publishedDate: string | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
};

export type CitedReference = {
  stance: ClaimStance;
  passage: string;
  locator: string | null;
  reference: PublicReference;
};

/** A reference a profile cites for its own statements about the person. */
export type ProfileSource = {
  passage: string;
  locator: string | null;
  reference: PublicReference;
};

export type CountryRole = {
  country: CountryLink;
  role: string | null;
  /** Partial dates: YYYY, YYYY-MM, or YYYY-MM-DD. */
  startDate: string | null;
  endDate: string | null;
};

export type TopicChangeEntry = {
  kind: "published" | "updated" | "archived" | "restored";
  note: string;
  date: string;
};

export type TopicPage = TopicSummary & {
  category: TermLink | null;
  tags: TermLink[];
  people: { individual: IndividualLink; role: TopicPersonRole }[];
  body: Topic["body"];
  /** Page addresses of the topics and individuals the body links to, by "collection:id"; links to anything not public are absent. */
  bodyLinks: Record<string, string>;
  evidence: PublicEvidence[];
  references: CitedReference[];
  changes: TopicChangeEntry[];
};

export type IndividualPage = {
  name: string;
  slug: string;
  aliases: string[];
  summary: string | null;
  photo: PublicFile | null;
  links: { label: string; url: string }[];
  wikidataId: string | null;
  /**
   * The profile's own statements and the sources behind them: present only
   * while every cited source is confirmed (profileIsBacked), else null.
   */
  backed: {
    bio: string | null;
    countries: CountryRole[];
    sources: ProfileSource[];
  } | null;
  topics: LimitedList<TopicSummary>;
};

export type CountryPage = {
  name: string;
  slug: string;
  region: string | null;
  subregion: string | null;
  topics: LimitedList<TopicSummary>;
  /** The individuals the listed topics name, by name. */
  people: IndividualLink[];
};

export type HomePage = {
  topics: LimitedList<TopicSummary>;
  /** Countries with at least one listed topic, by name. */
  countries: CountryLink[];
};
