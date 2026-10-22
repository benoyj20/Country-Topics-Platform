import { isWikidataId } from "@countrytopics/domain";
import * as z from "zod";

import {
  EVIDENCE_ROW_FIELDS,
  type EvidenceRow,
  evidenceRowOf,
  evidenceSaveRow,
  fileOf,
  type RelatedFile,
  SOURCE_ROW_FIELDS,
  type SourceRow,
  sourceRowOf,
  sourceSaveRow,
  storedEvidenceRow,
  storedSourceRow,
} from "./admin-evidence.ts";
import { recordOf, Related, type RelatedRecord } from "./admin-lists.ts";
import {
  type FieldTree,
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  type Row,
  rowId,
  storedText,
} from "./admin-records.ts";

// The admin's individual editor (ADR 0014, phase 9): a person's names,
// the countries they are linked to, their photo, staff notes, and the
// statements their public profile makes, each with its own evidence and
// sources (ADR 0007). The backend refuses a name another individual
// already has until the admin says this is a different person; the form
// warns as the name is typed, from the same rules.

export type AliasRow = Row & { name: string };

export type PersonCountryRow = Row & {
  country: RelatedRecord | null;
  role: string;
  /** YYYY, YYYY-MM, or YYYY-MM-DD. */
  startDate: string;
  endDate: string;
};

export type StatementRow = Row & {
  text: string;
  evidence: EvidenceRow[];
  sources: SourceRow[];
};

export type PersonLinkRow = Row & { label: string; url: string };

export type IndividualValues = {
  name: string;
  aliases: AliasRow[];
  /** Never stored: the answer to the duplicate warning, for one save. */
  notADuplicate: boolean;
  summary: string;
  countries: PersonCountryRow[];
  photo: RelatedFile | null;
  bio: string;
  statements: StatementRow[];
  links: PersonLinkRow[];
  wikidataId: string;
  slug: string;
};

export type EditorIndividual = {
  id: string;
  values: IndividualValues;
  /** Set by the backend only. */
  status: RecordDates;
};

export const EMPTY_INDIVIDUAL: IndividualValues = {
  name: "",
  aliases: [],
  notADuplicate: false,
  summary: "",
  countries: [],
  photo: null,
  bio: "",
  statements: [],
  links: [],
  wikidataId: "",
  slug: "",
};

export function emptyAliasRow(): AliasRow {
  return { name: "" };
}

export function emptyPersonCountryRow(): PersonCountryRow {
  return { country: null, role: "", startDate: "", endDate: "" };
}

export function emptyStatementRow(): StatementRow {
  return { text: "", evidence: [], sources: [] };
}

export function emptyPersonLinkRow(): PersonLinkRow {
  return { label: "", url: "" };
}

const INDIVIDUAL_READ = [
  "name",
  "aliases",
  "summary",
  "countries",
  "photo",
  "bio",
  "statements",
  "links",
  "wikidataId",
  "slug",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/individuals/<id>`, and of a save. */
export function individualSearchParams(): URLSearchParams {
  return recordSearchParams(INDIVIDUAL_READ);
}

export const storedIndividualSchema = z.looseObject({
  id: z.string(),
  name: storedText,
  aliases: z
    .array(z.looseObject({ id: storedText, name: storedText }))
    .nullish(),
  summary: storedText,
  countries: z
    .array(
      z.looseObject({
        id: storedText,
        country: Related.nullish(),
        role: storedText,
        startDate: storedText,
        endDate: storedText,
      }),
    )
    .nullish(),
  photo: Related.nullish(),
  bio: storedText,
  statements: z
    .array(
      z.looseObject({
        id: storedText,
        text: storedText,
        evidence: z.array(storedEvidenceRow).nullish(),
        sources: z.array(storedSourceRow).nullish(),
      }),
    )
    .nullish(),
  links: z
    .array(
      z.looseObject({ id: storedText, label: storedText, url: storedText }),
    )
    .nullish(),
  wikidataId: storedText,
  slug: storedText,
  ...recordDates,
});
export type StoredIndividual = z.infer<typeof storedIndividualSchema>;

export function editorIndividual(stored: StoredIndividual): EditorIndividual {
  return {
    id: stored.id,
    values: {
      name: stored.name ?? "",
      aliases: (stored.aliases ?? []).map((row) => ({
        ...rowId(row.id),
        name: row.name ?? "",
      })),
      notADuplicate: false,
      summary: stored.summary ?? "",
      countries: (stored.countries ?? []).map((row) => ({
        ...rowId(row.id),
        country: row.country ? recordOf("countries", row.country) : null,
        role: row.role ?? "",
        startDate: row.startDate ?? "",
        endDate: row.endDate ?? "",
      })),
      photo: stored.photo ? fileOf(stored.photo) : null,
      bio: stored.bio ?? "",
      statements: (stored.statements ?? []).map((row) => ({
        ...rowId(row.id),
        text: row.text ?? "",
        evidence: (row.evidence ?? []).map(evidenceRowOf),
        sources: (row.sources ?? []).map(sourceRowOf),
      })),
      links: (stored.links ?? []).map((row) => ({
        ...rowId(row.id),
        label: row.label ?? "",
        url: row.url ?? "",
      })),
      wikidataId: stored.wikidataId ?? "",
      slug: stored.slug ?? "",
    },
    status: { createdAt: stored.createdAt, updatedAt: stored.updatedAt },
  };
}

/**
 * The JSON body of a save: `POST /api/individuals` for a new one, `PATCH
 * /api/individuals/<id>` for one that exists. An empty slug is filled
 * from the name; a blank Wikidata ID is stored as none.
 */
export function individualSaveBody(
  values: IndividualValues,
): Record<string, unknown> {
  return {
    name: values.name,
    aliases: values.aliases.map((row) => ({
      ...rowId(row.id),
      name: row.name,
    })),
    summary: optionalText(values.summary),
    countries: values.countries.map((row) => ({
      ...rowId(row.id),
      country: row.country?.id ?? null,
      role: optionalText(row.role),
      startDate: optionalText(row.startDate),
      endDate: optionalText(row.endDate),
    })),
    photo: values.photo?.id ?? null,
    bio: optionalText(values.bio),
    statements: values.statements.map((row) => ({
      ...rowId(row.id),
      text: row.text,
      evidence: row.evidence.map(evidenceSaveRow),
      sources: row.sources.map(sourceSaveRow),
    })),
    links: values.links.map((row) => ({
      ...rowId(row.id),
      label: row.label,
      url: row.url,
    })),
    wikidataId: optionalText(values.wikidataId),
    slug: values.slug.trim(),
    ...(values.notADuplicate ? { notADuplicate: true } : {}),
  };
}

const INDIVIDUAL_FIELDS: FieldTree = {
  name: true,
  aliases: { name: true },
  notADuplicate: true,
  summary: true,
  countries: { country: true, role: true, startDate: true, endDate: true },
  photo: true,
  bio: true,
  statements: {
    text: true,
    evidence: EVIDENCE_ROW_FIELDS,
    sources: SOURCE_ROW_FIELDS,
  },
  links: { label: true, url: true },
  wikidataId: true,
  slug: true,
};

export function individualFieldOf(path: string): string | null {
  return fieldOfTree(INDIVIDUAL_FIELDS, path);
}

/** What the duplicate warning is asked about: the names as typed. */
export type DuplicateQuery = {
  name: string;
  aliases: readonly string[];
  wikidataId: string;
  /** The individual being edited, which is not its own duplicate. */
  exclude: string | null;
};

/** The query string of `GET /api/individuals/possible-duplicates`. */
export function possibleDuplicatesSearchParams(
  query: DuplicateQuery,
): URLSearchParams {
  const params = new URLSearchParams({ name: query.name });
  for (const alias of query.aliases) {
    if (alias.trim()) params.append("alias", alias);
  }
  // The backend refuses a query with an id that is not one.
  const wikidataId = query.wikidataId.trim();
  if (isWikidataId(wikidataId)) params.set("wikidataId", wikidataId);
  if (query.exclude) params.set("exclude", query.exclude);
  return params;
}

export const DUPLICATE_MATCHES = [
  "wikidata",
  "name",
  "alias",
  "similar name",
] as const;

export const possibleDuplicatesSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string().nullable(),
      matchedOn: z.enum(DUPLICATE_MATCHES),
      /**
       * A name or alias being added is exactly another individual's: the
       * backend refuses the save until the admin says this is a different person.
       */
      needsConfirmation: z.boolean(),
    }),
  ),
});
export type PossibleDuplicate = z.infer<
  typeof possibleDuplicatesSchema
>["matches"][number];
