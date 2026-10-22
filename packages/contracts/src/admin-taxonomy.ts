import * as z from "zod";

import {
  type FieldTree,
  fieldOfTree,
  optionalText,
  type RecordDates,
  recordDates,
  recordSearchParams,
  storedText,
} from "./admin-records.ts";

// The admin's editors for the labels topics are filed under (ADR 0014,
// phase 9): countries, whose ISO codes never change, and categories and
// tags, which admins make, rename, and delete. Each is read with the
// fields its form shows, and saved through Payload's REST API.

export type CountryValues = {
  name: string;
  region: string;
  subregion: string;
  slug: string;
};

/** The ISO 3166-1 entry, loaded by a migration and never edited. */
export type CountryCodes = {
  code: string;
  alpha3: string;
  numericCode: string;
  isoName: string;
};

export type EditorCountry = {
  id: string;
  values: CountryValues;
  codes: CountryCodes;
  /** Set by the backend only. */
  status: RecordDates;
};

const COUNTRY_READ = [
  "name",
  "code",
  "alpha3",
  "numericCode",
  "isoName",
  "region",
  "subregion",
  "slug",
  "createdAt",
  "updatedAt",
] as const;

/** The query string of `GET /api/countries/<id>`, and of a save. */
export function countrySearchParams(): URLSearchParams {
  return recordSearchParams(COUNTRY_READ, { depth: 0 });
}

export const storedCountrySchema = z.looseObject({
  id: z.string(),
  name: storedText,
  code: z.string(),
  alpha3: z.string(),
  numericCode: z.string(),
  isoName: z.string(),
  region: storedText,
  subregion: storedText,
  slug: storedText,
  ...recordDates,
});
export type StoredCountry = z.infer<typeof storedCountrySchema>;

export function editorCountry(stored: StoredCountry): EditorCountry {
  return {
    id: stored.id,
    values: {
      name: stored.name ?? "",
      region: stored.region ?? "",
      subregion: stored.subregion ?? "",
      slug: stored.slug ?? "",
    },
    codes: {
      code: stored.code,
      alpha3: stored.alpha3,
      numericCode: stored.numericCode,
      isoName: stored.isoName,
    },
    status: { createdAt: stored.createdAt, updatedAt: stored.updatedAt },
  };
}

/** The JSON body of `PATCH /api/countries/<id>`; the codes are never sent. */
export function countrySaveBody(
  values: CountryValues,
): Record<string, unknown> {
  return {
    name: values.name,
    region: optionalText(values.region),
    subregion: optionalText(values.subregion),
    slug: values.slug.trim(),
  };
}

const COUNTRY_FIELDS: FieldTree = {
  name: true,
  region: true,
  subregion: true,
  slug: true,
};

export function countryFieldOf(path: string): string | null {
  return fieldOfTree(COUNTRY_FIELDS, path);
}

/** The two collections of topic labels: broad categories and free tags. */
export type TermCollection = "categories" | "tags";

/** A category's or a tag's form; tags have no description. */
export type TermValues = { name: string; description: string; slug: string };

export const EMPTY_TERM: TermValues = { name: "", description: "", slug: "" };

export type EditorTerm = {
  id: string;
  values: TermValues;
  status: RecordDates;
};

/** The query string of `GET /api/<categories|tags>/<id>`, and of a save. */
export function termSearchParams(collection: TermCollection): URLSearchParams {
  return recordSearchParams(
    [
      "name",
      ...(collection === "categories" ? ["description"] : []),
      "slug",
      "createdAt",
      "updatedAt",
    ],
    { depth: 0 },
  );
}

export const storedTermSchema = z.looseObject({
  id: z.string(),
  name: storedText,
  description: storedText,
  slug: storedText,
  ...recordDates,
});
export type StoredTerm = z.infer<typeof storedTermSchema>;

export function editorTerm(stored: StoredTerm): EditorTerm {
  return {
    id: stored.id,
    values: {
      name: stored.name ?? "",
      description: stored.description ?? "",
      slug: stored.slug ?? "",
    },
    status: { createdAt: stored.createdAt, updatedAt: stored.updatedAt },
  };
}

/**
 * The JSON body of a save: `POST /api/<collection>` for a new one, `PATCH`
 * for one that exists. An empty slug is filled from the name.
 */
export function termSaveBody(
  collection: TermCollection,
  values: TermValues,
): Record<string, unknown> {
  return {
    name: values.name,
    ...(collection === "categories"
      ? { description: optionalText(values.description) }
      : {}),
    slug: values.slug.trim(),
  };
}

const TERM_FIELDS: FieldTree = { name: true, description: true, slug: true };

export function termFieldOf(path: string): string | null {
  return fieldOfTree(TERM_FIELDS, path);
}
