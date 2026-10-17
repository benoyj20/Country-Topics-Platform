import {
  formatTime,
  VIDEO_LENGTH_TOLERANCE_S,
  type VideoCheckStatus,
} from "./snippets.ts";

/**
 * F3 evidence and references. Evidence shows what happened (a document, an
 * image, an archived web page, or a video snippet). A reference is
 * a bibliographic record (paper, book, report, web page); a topic cites it with
 * the passage that supports or contradicts the topic, which the design calls a
 * claim reference.
 */
export const EVIDENCE_KINDS = ["document", "image", "link", "snippet"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** How a cited passage relates to the topic. */
export const CLAIM_STANCES = ["supports", "contradicts", "context"] as const;
export type ClaimStance = (typeof CLAIM_STANCES)[number];

export const REFERENCE_KINDS = [
  "article",
  "book",
  "chapter",
  "report",
  "web_page",
  "dataset",
  "other",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/**
 * Whether a reference's DOI, ISBN, and link were confirmed by their registries
 * or sites. "Not found" and "failed" stay distinct: a DOI that does not exist
 * is a mistake to fix, while a check that could not finish is tried again.
 */
export const REFERENCE_CHECK_STATUSES = [
  "pending",
  "resolved",
  "not_found",
  "failed",
] as const;
export type ReferenceCheckStatus = (typeof REFERENCE_CHECK_STATUSES)[number];

/**
 * Whether the Wayback Machine holds a copy of a link. A link with no record
 * yet is waiting for the worker.
 */
export const LINK_ARCHIVE_STATUSES = [
  "archived",
  "not_archived",
  "failed",
] as const;
export type LinkArchiveStatus = (typeof LINK_ARCHIVE_STATUSES)[number];

export type ReferenceIdentifier = "doi" | "isbn" | "url";

/** The result of checking one identifier of a reference. */
export type IdentifierCheck = {
  identifier: ReferenceIdentifier;
  outcome: "resolved" | "not_found" | "failed";
  /** Shown to admins; never contains secrets or response bodies. */
  message?: string;
};

const IDENTIFIER_LABELS: Record<ReferenceIdentifier, string> = {
  doi: "DOI",
  isbn: "ISBN",
  url: "Link",
};

/**
 * A reference is confirmed only when every identifier it gives resolves: a
 * mistyped DOI next to a working link is still a mistake. Anything not found
 * outranks a check that could not finish.
 */
export function referenceCheckResult(checks: IdentifierCheck[]): {
  status: Exclude<ReferenceCheckStatus, "pending">;
  message: string;
} {
  const describe = (check: IdentifierCheck) =>
    `${IDENTIFIER_LABELS[check.identifier]}: ${check.message ?? check.outcome.replace("_", " ")}`;
  const notFound = checks.filter((check) => check.outcome === "not_found");
  if (notFound.length > 0) {
    return { status: "not_found", message: notFound.map(describe).join(" ") };
  }
  const failed = checks.filter((check) => check.outcome === "failed");
  if (failed.length > 0) {
    return { status: "failed", message: failed.map(describe).join(" ") };
  }
  if (checks.length === 0) {
    return { status: "not_found", message: "No DOI, ISBN, or link to check." };
  }
  return {
    status: "resolved",
    message: checks.map(describe).join(" "),
  };
}

export type TopicEvidence = {
  /**
   * The topic names an individual: in its list of people, by a link in its
   * text, or as the speaker of a snippet it uses as evidence.
   */
  namesIndividuals: boolean;
  evidenceCount: number;
  /** The references the topic cites, with their check status. */
  references: { title: string; checkStatus: ReferenceCheckStatus | null }[];
  /** The snippets the topic uses as evidence, with their video's check. */
  snippets: SnippetEvidence[];
};

export type SnippetEvidence = {
  caption: string;
  end_s: number;
  video: {
    checkStatus: VideoCheckStatus | null;
    /** The worker once found the video playable on other sites. */
    confirmed: boolean;
    duration_s: number | null;
  } | null;
};

export type EvidenceProblem = {
  field: "evidence" | "references";
  message: string;
};

const UNCONFIRMED_REASONS: Record<
  Exclude<ReferenceCheckStatus, "resolved">,
  string
> = {
  pending: "still being checked",
  not_found: "its DOI, ISBN, or link was not found",
  failed: "the check could not finish; save the reference to try again",
};

const UNCONFIRMED_VIDEO_REASONS: Record<VideoCheckStatus, string> = {
  pending: "its video is still being checked",
  // Confirmed videos never reach this table; listed for completeness.
  playable: "its video is still being checked",
  not_embeddable: "its video cannot be played on other sites",
  unavailable: "its video was not found, or is private",
  failed: "its video check could not finish; save the snippet to try again",
};

/**
 * Why each snippet cannot back a published topic: its video was never
 * confirmed playable, or the clip ends after the video does. A video that
 * was confirmed and later disappears does not block: the snippet keeps its
 * transcript, and the page says the video is gone.
 */
function snippetProblems(snippets: SnippetEvidence[]): string[] {
  return snippets.flatMap(({ caption, end_s, video }) => {
    if (!video) return [`"${caption}" (its video is missing)`];
    if (!video.confirmed) {
      return [
        `"${caption}" (${UNCONFIRMED_VIDEO_REASONS[video.checkStatus ?? "pending"]})`,
      ];
    }
    if (
      video.duration_s !== null &&
      end_s > video.duration_s + VIDEO_LENGTH_TOLERANCE_S
    ) {
      return [
        `"${caption}" (it ends after the video, which is ${formatTime(video.duration_s)} long)`,
      ];
    }
    return [];
  });
}

/**
 * What stops a topic from being published, as far as evidence goes:
 * - Every published statement about a named individual needs linked evidence
 *   and at least one reference (AGENTS.md).
 * - Every cited reference must be confirmed: a DOI or link must resolve
 *   before a reference is relied on.
 */
export function evidenceProblems(topic: TopicEvidence): EvidenceProblem[] {
  const problems: EvidenceProblem[] = [];
  if (topic.namesIndividuals && topic.evidenceCount === 0) {
    problems.push({
      field: "evidence",
      message:
        "This topic names individuals, so it needs at least one piece of evidence.",
    });
  }
  if (topic.namesIndividuals && topic.references.length === 0) {
    problems.push({
      field: "references",
      message:
        "This topic names individuals, so it needs at least one reference.",
    });
  }
  const unconfirmed = topic.references.flatMap(({ title, checkStatus }) =>
    checkStatus === "resolved"
      ? []
      : [`"${title}" (${UNCONFIRMED_REASONS[checkStatus ?? "pending"]})`],
  );
  if (unconfirmed.length > 0) {
    const list = unconfirmed.join(", ");
    problems.push({
      field: "references",
      message: `References must be confirmed before publishing: ${list}.`,
    });
  }
  const unplayable = snippetProblems(topic.snippets);
  if (unplayable.length > 0) {
    problems.push({
      field: "evidence",
      message: `Snippets need a video confirmed to play before publishing: ${unplayable.join(", ")}.`,
    });
  }
  return problems;
}

/**
 * Whether a statement on an individual's profile may be shown publicly: it
 * passes the same check as publishing a topic that names someone (evidence,
 * at least one reference, every reference confirmed, every snippet's video
 * found playable). Checked on every read, since a reference edited later is
 * "being checked" again.
 */
export function statementIsBacked(
  statement: Omit<TopicEvidence, "namesIndividuals">,
): boolean {
  return (
    evidenceProblems({ ...statement, namesIndividuals: true }).length === 0
  );
}
