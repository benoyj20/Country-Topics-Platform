/**
 * F3 evidence and references. Evidence shows what happened (a document, an
 * image, an archived web page; video snippets come in week 6). A reference is
 * a bibliographic record (paper, book, report, web page); a topic cites it with
 * the passage that supports or contradicts the topic, which the design calls a
 * claim reference.
 */
export const EVIDENCE_KINDS = ["document", "image", "link"] as const;
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
  /** The topic links an individual, in its list of people or in its text. */
  namesIndividuals: boolean;
  evidenceCount: number;
  /** The references the topic cites, with their check status. */
  references: { title: string; checkStatus: ReferenceCheckStatus | null }[];
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
  return problems;
}
