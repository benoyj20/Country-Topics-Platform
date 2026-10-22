"use client";

import {
  editorIndividual,
  emptyAliasRow,
  emptyEvidenceRow,
  emptyPersonCountryRow,
  emptyPersonLinkRow,
  emptySourceRow,
  emptyStatementRow,
  fileOf,
  individualFieldOf,
  individualSaveBody,
  individualSearchParams,
  type IndividualValues,
  type RecordDates,
  recordOf,
  storedIndividualSchema,
} from "@countrytopics/contracts";
import {
  DIFFERENT_PERSON_LABEL,
  IMAGE_MIME_TYPES,
  PERSON_ALIASES_MAX,
  PERSON_BIO_MAX_LENGTH,
  PERSON_COUNTRY_ROLE_MAX_LENGTH,
  PERSON_LINK_LABEL_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
  PERSON_SUMMARY_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  STATEMENT_MAX_LENGTH,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";

import {
  EvidenceFields,
  openFile,
  SourceFields,
} from "../components/EvidenceFields";
import { Field } from "../components/Field";
import { RelationPicker } from "../components/RelationPicker";
import { ArrayField, RowList } from "../components/Rows";
import { EVIDENCE_TEXTS, sourceTexts } from "../evidence-text";
import {
  arrayProps,
  type FieldTexts,
  pickerAria,
  rowNameAt,
} from "../field-text";
import { patchRow } from "../form-state";
import { deleteRecord, saveRecord } from "../write";
import { TextArea, TextInput } from "./inputs";
import { PossibleDuplicates } from "./PossibleDuplicates";
import { type FormApi, RecordForm } from "./RecordForm";

// The individual editor, as Payload's panel edits an individual
// (apps/web/src/collections/Individuals.ts): names and the duplicate
// warning, the countries they are linked to, a photo, staff notes, the
// statements their public profile makes with each one's evidence and
// sources, and links.

const TEXTS: FieldTexts = {
  name: {
    label: "Name",
    description: "The name the person is best known by.",
  },
  aliases: {
    label: "Aliases",
    description:
      "Other names and spellings: birth names, transliterations, initials.",
    row: "Alias",
    fields: { name: { label: "Name" } },
  },
  notADuplicate: { label: DIFFERENT_PERSON_LABEL },
  summary: {
    label: "Role or description",
    description:
      "One line that tells people with the same name apart in the admin, such as 'Economist' or 'Minister of Finance'. Seen by staff only; to say it publicly, add it as a statement below.",
  },
  countries: {
    label: "Countries",
    description:
      "Countries this person is linked to, their role there, and when. Seen by staff only; to say a role on the public profile, add it as a statement below, with its evidence and sources.",
    row: "Country",
    fields: {
      country: { label: "Country" },
      role: {
        label: "Role",
        description:
          "Such as 'Member of Parliament' or 'Central bank governor'.",
      },
      startDate: {
        label: "From",
        description: "YYYY, YYYY-MM, or YYYY-MM-DD.",
      },
      endDate: { label: "To", description: "Empty while it continues." },
    },
  },
  photo: {
    label: "Photo",
    description:
      "Optional. Only a photo we may publish; record its licence and credit on the file.",
  },
  bio: {
    label: "Bio",
    description:
      "Notes for staff, never shown publicly. What the public profile says goes under Statements, each with its evidence and sources.",
  },
  statements: {
    label: "Statements",
    description:
      "What the public profile says about this person, one fact per statement. Each statement is shown only with its own evidence and sources, every source confirmed and every video found playable; until then it stays hidden, and the others are still shown.",
    row: "Statement",
    fields: {
      text: {
        label: "Statement",
        description:
          "One fact, such as 'Minister of Finance from May 2019 to March 2022.' Say only what the evidence and sources below show.",
      },
      evidence: {
        label: "Evidence",
        description:
          "What shows the statement is true: an official document, an archived web page, a photo, or a video snippet. At least one.",
        row: "Evidence",
        fields: EVIDENCE_TEXTS,
      },
      sources: {
        label: "Sources",
        description:
          "References that support the statement, each with the passage that does. At least one, all confirmed.",
        row: "Source",
        fields: sourceTexts(
          "The words in the reference that support the statement, quoted exactly.",
        ),
      },
    },
  },
  links: {
    label: "Links",
    description: "Official pages and other profiles.",
    row: "Link",
    fields: { label: { label: "Label" }, url: { label: "URL" } },
  },
  wikidataId: {
    label: "Wikidata ID",
    description: "Optional. Tells people with the same name apart.",
  },
  slug: {
    label: "Slug",
    description:
      "Used in links. Filled from the name when left empty; changing it later breaks old links.",
  },
};

const ORDER = Object.keys(TEXTS);

type Form = FormApi<IndividualValues>;
type ArrayKey = "aliases" | "countries" | "statements" | "links";

/** A row of a top-level array changed: its fields' messages go. */
function setRow<K extends ArrayKey>(
  form: Form,
  array: K,
  index: number,
  patch: Partial<IndividualValues[K][number]>,
) {
  form.update(
    (values) => ({
      ...values,
      // TypeScript widens `values[array]` to every array's rows; it is K's.
      [array]: patchRow(
        values[array] as IndividualValues[K][number][],
        index,
        patch,
      ),
    }),
    [array, ...Object.keys(patch).map((field) => `${array}.${index}.${field}`)],
  );
}

export function IndividualForm({
  id,
  values,
  status,
  canEdit,
  notice,
  onCreated,
}: {
  id: string | null;
  values: IndividualValues;
  status: RecordDates | null;
  canEdit: boolean;
  notice?: string;
  /** Made from another record's field: called with the new record's id. */
  onCreated?: (id: string) => void;
}) {
  return (
    <RecordForm
      id={id}
      values={values}
      status={status}
      noun="individual"
      collection="individuals"
      canEdit={canEdit}
      canDelete
      readOnlyNotice="You can read this individual. Only admins edit individuals."
      notice={notice}
      onCreated={onCreated}
      texts={TEXTS}
      order={ORDER}
      saveBody={individualSaveBody}
      save={(saving, sent) =>
        saveRecord(
          {
            collection: "individuals",
            id: saving,
            query: individualSearchParams(),
            body: individualSaveBody(sent),
            fieldOf: individualFieldOf,
            schema: storedIndividualSchema,
          },
          editorIndividual,
        )
      }
      remove={(removing) =>
        deleteRecord("individuals", removing, individualFieldOf)
      }
      side={(form) => (
        <>
          <TextInput form={form} name="wikidataId" maxLength={13} />
          <TextInput form={form} name="slug" maxLength={SLUG_MAX_LENGTH} />
        </>
      )}
      details={() => ({
        links: [
          {
            href: `/individuals/${encodeURIComponent(values.slug)}`,
            label: "View the profile on the site",
            external: true,
          },
        ],
      })}
    >
      {(form) => <IndividualFields form={form} id={id} />}
    </RecordForm>
  );
}

function IndividualFields({ form, id }: { form: Form; id: string | null }) {
  const { values, readOnly } = form;
  const photo = form.field("photo");
  return (
    <>
      <TextInput
        form={form}
        name="name"
        maxLength={PERSON_NAME_MAX_LENGTH}
        required
        large
      />
      <ArrayField {...arrayProps(form.field("aliases"))}>
        <RowList
          name={rowNameAt(TEXTS, "aliases")}
          rows={values.aliases}
          readOnly={readOnly}
          max={PERSON_ALIASES_MAX}
          onRows={(rows) => form.set({ aliases: rows }, { rows: true })}
          onAdd={() =>
            form.set({ aliases: [...values.aliases, emptyAliasRow()] })
          }
        >
          {(row, index) => {
            const name = form.field(`aliases.${index}.name`);
            return (
              <Field {...name} required>
                <input
                  id={name.id}
                  className="admin-input"
                  value={row.name}
                  maxLength={PERSON_NAME_MAX_LENGTH}
                  disabled={readOnly}
                  {...name.aria}
                  onChange={(event) =>
                    setRow(form, "aliases", index, { name: event.target.value })
                  }
                />
              </Field>
            );
          }}
        </RowList>
      </ArrayField>
      <PossibleDuplicates
        query={{
          name: values.name,
          aliases: values.aliases.map((row) => row.name),
          wikidataId: values.wikidataId,
          exclude: id,
        }}
        field={form.field("notADuplicate")}
        checked={values.notADuplicate}
        readOnly={readOnly}
        onChange={(checked) => form.set({ notADuplicate: checked })}
      />
      <TextInput
        form={form}
        name="summary"
        maxLength={PERSON_SUMMARY_MAX_LENGTH}
      />

      <ArrayField {...arrayProps(form.field("countries"))}>
        <RowList
          name={rowNameAt(TEXTS, "countries")}
          rows={values.countries}
          readOnly={readOnly}
          onRows={(rows) => form.set({ countries: rows }, { rows: true })}
          onAdd={() =>
            form.set({
              countries: [...values.countries, emptyPersonCountryRow()],
            })
          }
        >
          {(row, index) => {
            const at = `countries.${index}`;
            const country = form.field(`${at}.country`);
            const text = (
              field: "role" | "startDate" | "endDate",
              max?: number,
            ) => {
              const props = form.field(`${at}.${field}`);
              return (
                <Field {...props}>
                  <input
                    id={props.id}
                    className="admin-input"
                    value={row[field]}
                    maxLength={max}
                    disabled={readOnly}
                    {...props.aria}
                    onChange={(event) =>
                      setRow(form, "countries", index, {
                        [field]: event.target.value,
                      })
                    }
                  />
                </Field>
              );
            };
            return (
              <>
                <div className="admin-fields two">
                  <Field {...country} required>
                    <RelationPicker
                      id={country.id}
                      collection="countries"
                      value={row.country ? [row.country] : []}
                      onChange={(chosen) =>
                        setRow(form, "countries", index, {
                          country: chosen.at(-1) ?? null,
                        })
                      }
                      toRecord={(match) => recordOf("countries", match)}
                      disabled={readOnly}
                      {...pickerAria(country)}
                    />
                  </Field>
                  {text("role", PERSON_COUNTRY_ROLE_MAX_LENGTH)}
                </div>
                <div className="admin-fields two">
                  {text("startDate", 10)}
                  {text("endDate", 10)}
                </div>
              </>
            );
          }}
        </RowList>
      </ArrayField>

      <Field {...photo}>
        <RelationPicker
          id={photo.id}
          collection="media"
          value={values.photo ? [values.photo] : []}
          onChange={(chosen) => form.set({ photo: chosen.at(-1) ?? null })}
          toRecord={fileOf}
          extra={["filename", "mimeType", "url"]}
          where={{ mimeType: { in: [...IMAGE_MIME_TYPES] } }}
          describe={openFile}
          disabled={readOnly}
          {...pickerAria(photo)}
        />
      </Field>
      <TextArea
        form={form}
        name="bio"
        maxLength={PERSON_BIO_MAX_LENGTH}
        rows={5}
      />

      <ArrayField {...arrayProps(form.field("statements"))}>
        <RowList
          name={rowNameAt(TEXTS, "statements")}
          rows={values.statements}
          readOnly={readOnly}
          onRows={(rows) => form.set({ statements: rows }, { rows: true })}
          onAdd={() =>
            form.set({
              statements: [...values.statements, emptyStatementRow()],
            })
          }
        >
          {(row, index) => (
            <StatementFields form={form} index={index} row={row} />
          )}
        </RowList>
      </ArrayField>

      <ArrayField {...arrayProps(form.field("links"))}>
        <RowList
          name={rowNameAt(TEXTS, "links")}
          rows={values.links}
          readOnly={readOnly}
          onRows={(rows) => form.set({ links: rows }, { rows: true })}
          onAdd={() =>
            form.set({ links: [...values.links, emptyPersonLinkRow()] })
          }
        >
          {(row, index) => {
            const label = form.field(`links.${index}.label`);
            const url = form.field(`links.${index}.url`);
            return (
              <div className="admin-fields two">
                <Field {...label} required>
                  <input
                    id={label.id}
                    className="admin-input"
                    value={row.label}
                    maxLength={PERSON_LINK_LABEL_MAX_LENGTH}
                    disabled={readOnly}
                    {...label.aria}
                    onChange={(event) =>
                      setRow(form, "links", index, {
                        label: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field {...url} required>
                  <input
                    id={url.id}
                    className="admin-input"
                    type="url"
                    inputMode="url"
                    value={row.url}
                    maxLength={URL_MAX_LENGTH}
                    disabled={readOnly}
                    {...url.aria}
                    onChange={(event) =>
                      setRow(form, "links", index, { url: event.target.value })
                    }
                  />
                </Field>
              </div>
            );
          }}
        </RowList>
      </ArrayField>
    </>
  );
}

/** One statement: its text, and its own evidence and sources. */
function StatementFields({
  form,
  index,
  row,
}: {
  form: Form;
  index: number;
  row: IndividualValues["statements"][number];
}) {
  const { readOnly, refusal } = form;
  const at = `statements.${index}`;
  const text = form.field(`${at}.text`);

  /** Changes this statement's evidence or sources. */
  function setNested<K extends "evidence" | "sources">(
    array: K,
    rows: IndividualValues["statements"][number][K],
    keys: string[],
    options?: { rows?: boolean },
  ) {
    form.update(
      (values) => ({
        ...values,
        statements: patchRow(values.statements, index, { [array]: rows }),
      }),
      [`${at}.${array}`, ...keys],
      options,
    );
  }

  return (
    <>
      <Field {...text} required>
        <textarea
          id={text.id}
          className="admin-input"
          rows={3}
          value={row.text}
          maxLength={STATEMENT_MAX_LENGTH}
          disabled={readOnly}
          {...text.aria}
          onChange={(event) =>
            setRow(form, "statements", index, { text: event.target.value })
          }
        />
      </Field>
      <ArrayField {...arrayProps(form.field(`${at}.evidence`))} nested>
        <RowList
          name={rowNameAt(TEXTS, `${at}.evidence`)}
          rows={row.evidence}
          readOnly={readOnly}
          onRows={(rows) => setNested("evidence", rows, [], { rows: true })}
          onAdd={() =>
            setNested("evidence", [...row.evidence, emptyEvidenceRow()], [])
          }
        >
          {(evidence, number) => (
            <EvidenceFields
              texts={TEXTS}
              at={`${at}.evidence.${number}`}
              row={evidence}
              refusal={refusal}
              readOnly={readOnly}
              onChange={(patch) =>
                setNested(
                  "evidence",
                  patchRow(row.evidence, number, patch),
                  Object.keys(patch).map(
                    (field) => `${at}.evidence.${number}.${field}`,
                  ),
                )
              }
            />
          )}
        </RowList>
      </ArrayField>
      <ArrayField {...arrayProps(form.field(`${at}.sources`))} nested>
        <RowList
          name={rowNameAt(TEXTS, `${at}.sources`)}
          rows={row.sources}
          readOnly={readOnly}
          onRows={(rows) => setNested("sources", rows, [], { rows: true })}
          onAdd={() =>
            setNested("sources", [...row.sources, emptySourceRow()], [])
          }
        >
          {(source, number) => (
            <SourceFields
              texts={TEXTS}
              at={`${at}.sources.${number}`}
              row={source}
              refusal={refusal}
              readOnly={readOnly}
              onChange={(patch) =>
                setNested(
                  "sources",
                  patchRow(row.sources, number, patch),
                  Object.keys(patch).map(
                    (field) => `${at}.sources.${number}.${field}`,
                  ),
                )
              }
            />
          )}
        </RowList>
      </ArrayField>
    </>
  );
}
