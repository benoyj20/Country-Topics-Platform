"use client";

import {
  type CountryCodes,
  countryFieldOf,
  countrySaveBody,
  countrySearchParams,
  type CountryValues,
  editorCountry,
  editorTerm,
  type RecordDates,
  storedCountrySchema,
  storedTermSchema,
  type TermCollection,
  termFieldOf,
  termSaveBody,
  termSearchParams,
  type TermValues,
} from "@countrytopics/contracts";
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
} from "@countrytopics/domain";
import { useCallback } from "react";

import type { FieldTexts } from "../field-text";
import { deleteRecord, saveRecord } from "../write";
import { TextArea, TextInput } from "./inputs";
import { RecordForm } from "./RecordForm";

// The editors of the labels topics are filed under, as Payload's panel
// edits them (apps/web/src/collections/Countries.ts, Categories.ts,
// Tags.ts): a country's name, grouping, and slug, beside its ISO codes;
// a category's or a tag's name and slug.

const FILLED_SLUG =
  "Used in links. Filled from the name when left empty; changing it later breaks old links.";

const COUNTRY_TEXTS: FieldTexts = {
  name: { label: "Name", description: "The name shown on the site." },
  region: {
    label: "Region",
    description: "UN M49 region, used to group the country picker.",
  },
  subregion: { label: "Subregion", description: "UN M49 sub-region." },
  slug: {
    label: "Slug",
    description: "Used in links; changing it later breaks old links.",
  },
};

const TERM_TEXTS: Record<TermCollection, FieldTexts> = {
  categories: {
    name: { label: "Name" },
    description: { label: "Description" },
    slug: { label: "Slug", description: FILLED_SLUG },
  },
  tags: {
    name: { label: "Name" },
    slug: { label: "Slug", description: FILLED_SLUG },
  },
};

const NOUNS: Record<TermCollection, string> = {
  categories: "category",
  tags: "tag",
};

const NAME_MAX_LENGTH: Record<TermCollection, number> = {
  categories: CATEGORY_NAME_MAX_LENGTH,
  tags: TAG_NAME_MAX_LENGTH,
};

export function CountryForm({
  id,
  values,
  codes,
  status,
  canEdit,
  notice,
}: {
  id: string;
  values: CountryValues;
  codes: CountryCodes;
  status: RecordDates;
  canEdit: boolean;
  notice?: string;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="country"
      collection="countries"
      canEdit={canEdit}
      readOnlyNotice="You can read this country. Only admins edit countries."
      notice={notice}
      texts={COUNTRY_TEXTS}
      order={["name", "region", "subregion", "slug"]}
      saveBody={countrySaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "countries",
            id: saving,
            query: countrySearchParams(),
            body: countrySaveBody(sent),
            fieldOf: countryFieldOf,
            schema: storedCountrySchema,
          },
          editorCountry,
        )
      }
      details={() => ({
        links: [
          {
            href: `/countries/${encodeURIComponent(values.slug)}`,
            label: "View on the site",
            external: true,
          },
        ],
      })}
    >
      {(form) => (
        <>
          <TextInput form={form} name="name" required large />
          <dl className="admin-details wide" aria-label="ISO 3166-1">
            <div>
              <dt>ISO 3166-1 alpha-2</dt>
              <dd>{codes.code}</dd>
            </div>
            <div>
              <dt>Alpha-3</dt>
              <dd>{codes.alpha3}</dd>
            </div>
            <div>
              <dt>Numeric</dt>
              <dd>{codes.numericCode}</dd>
            </div>
            <div>
              <dt>ISO short name</dt>
              <dd>{codes.isoName}</dd>
            </div>
          </dl>
          <p className="admin-muted">
            The ISO codes come from the standard and never change.
          </p>
          <div className="admin-fields two">
            <TextInput form={form} name="region" />
            <TextInput form={form} name="subregion" />
          </div>
          <TextInput
            form={form}
            name="slug"
            maxLength={SLUG_MAX_LENGTH}
            required
          />
        </>
      )}
    </RecordForm>
  );
}

export function TermForm({
  collection,
  id,
  values,
  status,
  canEdit,
  notice,
  onCreated,
}: {
  collection: TermCollection;
  id: string | null;
  values: TermValues;
  status: RecordDates | null;
  canEdit: boolean;
  notice?: string;
  /** Made from another record's field: called with the new record's id. */
  onCreated?: (id: string) => void;
}) {
  const noun = NOUNS[collection];
  const saveBody = useCallback(
    (sent: TermValues) => termSaveBody(collection, sent),
    [collection],
  );
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun={noun}
      collection={collection}
      canEdit={canEdit}
      canDelete
      readOnlyNotice={`You can read this ${noun}. Only admins edit ${collection}.`}
      notice={notice}
      onCreated={onCreated}
      texts={TERM_TEXTS[collection]}
      order={["name", "description", "slug"]}
      saveBody={saveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: collection,
            id: saving,
            query: termSearchParams(collection),
            body: saveBody(sent),
            fieldOf: termFieldOf,
            schema: storedTermSchema,
          },
          editorTerm,
        )
      }
      remove={(removing) => deleteRecord(collection, removing, termFieldOf)}
      details={() => ({
        links: [
          {
            href: `/topics?${collection === "categories" ? "category" : "tag"}=${encodeURIComponent(values.slug)}`,
            label: "Its topics on the site",
            external: true,
          },
        ],
      })}
    >
      {(form) => (
        <>
          <TextInput
            form={form}
            name="name"
            maxLength={NAME_MAX_LENGTH[collection]}
            required
            large
          />
          {collection === "categories" && (
            <TextArea
              form={form}
              name="description"
              maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
            />
          )}
          <TextInput form={form} name="slug" maxLength={SLUG_MAX_LENGTH} />
        </>
      )}
    </RecordForm>
  );
}
