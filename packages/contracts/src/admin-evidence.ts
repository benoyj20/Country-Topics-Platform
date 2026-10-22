import {
  EVIDENCE_KINDS,
  type EvidenceKind,
  REFERENCE_CHECK_STATUSES,
  type ReferenceCheckStatus,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  recordOf,
  Related,
  type RelatedRecord,
  type RelatedValue,
} from "./admin-lists.ts";
import {
  type FieldTree,
  mediaFilePath,
  optionalText,
  REQUIRED_MESSAGE,
  type Row,
  rowId,
  storedText,
} from "./admin-records.ts";

// Evidence and sources, as the admin's editors hold them: topics' rows and
// the statements on individuals' profiles have the same kinds, fields,
// and checks wherever evidence backs a published statement (ADR 0007).

/** A file, with what an evidence row or a photo shows of it. */
export type RelatedFile = RelatedRecord & {
  mimeType: string | null;
  url: string | null;
};

/** A cited reference, with whether it can be published yet. */
export type RelatedReference = RelatedRecord & {
  checkStatus: ReferenceCheckStatus | null;
};

/** A file, by its description or else its name. */
export function fileOf(value: RelatedValue): RelatedFile {
  if (typeof value === "string") {
    return { id: value, title: null, mimeType: null, url: null };
  }
  const field = (name: string) => {
    const shown = value[name];
    return typeof shown === "string" && shown ? shown : null;
  };
  return {
    id: value.id,
    title: field("alt") ?? field("filename") ?? "",
    mimeType: field("mimeType"),
    url: mediaFilePath(field("url")),
  };
}

const CheckStatus = z.enum(REFERENCE_CHECK_STATUSES);

/** A reference, with its check. */
export function referenceOf(value: RelatedValue): RelatedReference {
  const status = CheckStatus.safeParse(
    typeof value === "string" ? undefined : value.checkStatus,
  );
  return {
    ...recordOf("references", value),
    checkStatus: status.success ? status.data : null,
  };
}

export type EvidenceRow = Row & {
  kind: EvidenceKind;
  title: string;
  file: RelatedFile | null;
  snippet: RelatedRecord | null;
  url: string;
  archiveUrl: string;
  note: string;
};

/** A reference that backs a statement, with the passage that does. */
export type SourceRow = Row & {
  reference: RelatedReference | null;
  passage: string;
  locator: string;
};

export function emptyEvidenceRow(): EvidenceRow {
  return {
    kind: "document",
    title: "",
    file: null,
    snippet: null,
    url: "",
    archiveUrl: "",
    note: "",
  };
}

export function emptySourceRow(): SourceRow {
  return { reference: null, passage: "", locator: "" };
}

/** An evidence row as Payload sends it. */
export const storedEvidenceRow = z.looseObject({
  id: storedText,
  kind: z.enum(EVIDENCE_KINDS).nullish(),
  title: storedText,
  file: Related.nullish(),
  snippet: Related.nullish(),
  url: storedText,
  archiveUrl: storedText,
  note: storedText,
});

/** A source row as Payload sends it; a topic's also has its stance. */
export const storedSourceRow = z.looseObject({
  id: storedText,
  reference: Related.nullish(),
  passage: storedText,
  locator: storedText,
});

export function evidenceRowOf(
  row: z.infer<typeof storedEvidenceRow>,
): EvidenceRow {
  return {
    ...rowId(row.id),
    kind: row.kind ?? "document",
    title: row.title ?? "",
    file: row.file ? fileOf(row.file) : null,
    snippet: row.snippet ? recordOf("snippets", row.snippet) : null,
    url: row.url ?? "",
    archiveUrl: row.archiveUrl ?? "",
    note: row.note ?? "",
  };
}

export function sourceRowOf(row: z.infer<typeof storedSourceRow>): SourceRow {
  return {
    ...rowId(row.id),
    reference: row.reference ? referenceOf(row.reference) : null,
    passage: row.passage ?? "",
    locator: row.locator ?? "",
  };
}

/** An evidence row as a save sends it: related records by id. */
export function evidenceSaveRow(row: EvidenceRow): Record<string, unknown> {
  return {
    ...rowId(row.id),
    kind: row.kind,
    title: optionalText(row.title),
    file: row.file?.id ?? null,
    snippet: row.snippet?.id ?? null,
    url: optionalText(row.url),
    archiveUrl: optionalText(row.archiveUrl),
    note: optionalText(row.note),
  };
}

export function sourceSaveRow(row: SourceRow): Record<string, unknown> {
  return {
    ...rowId(row.id),
    reference: row.reference?.id ?? null,
    passage: row.passage,
    locator: optionalText(row.locator),
  };
}

export const EVIDENCE_ROW_FIELDS = {
  kind: true,
  title: true,
  file: true,
  snippet: true,
  url: true,
  archiveUrl: true,
  note: true,
} as const satisfies FieldTree;

export const SOURCE_ROW_FIELDS = {
  reference: true,
  passage: true,
  locator: true,
} as const satisfies FieldTree;

/**
 * What an evidence row needs before it is published, with the backend's
 * messages, for the row at `at`, such as `evidence.0`.
 */
export function evidenceRowChecks(
  row: EvidenceRow,
  at: string,
  need: (key: string, message?: string) => void,
): void {
  if (!row.title.trim() && row.kind !== "snippet") {
    need(`${at}.title`, "Give the evidence a title.");
  }
  if ((row.kind === "document" || row.kind === "image") && !row.file) {
    need(`${at}.file`, REQUIRED_MESSAGE);
  }
  if (row.kind === "snippet" && !row.snippet) {
    need(`${at}.snippet`, REQUIRED_MESSAGE);
  }
  if (row.kind === "link" && !row.url.trim()) {
    need(`${at}.url`, "Enter the page's link.");
  }
}

/** What a source row needs before it is published, for the row at `at`. */
export function sourceRowChecks(
  row: SourceRow,
  at: string,
  need: (key: string, message?: string) => void,
): void {
  if (!row.reference) need(`${at}.reference`, REQUIRED_MESSAGE);
  if (!row.passage.trim()) need(`${at}.passage`, REQUIRED_MESSAGE);
}
