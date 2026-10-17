import {
  isPartialDate,
  isPartialDateRangeValid,
  isWikidataId,
  personNameKey,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Endpoint,
  ValidationError,
} from "payload";
import * as z from "zod";

import {
  isVerifiedStaff,
  verifiedAdminsOnly,
  verifiedStaffOnly,
} from "@/access";
import { auditHooks, relationId } from "@/audit";
import { queueLinkArchives } from "@/content-jobs";
import {
  findPossibleDuplicates,
  lockNameKeys,
  nameKeys,
} from "@/individuals/duplicates";
import { DIFFERENT_PERSON_LABEL } from "@/individuals/labels";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";

import {
  evidenceField,
  evidenceLinkUrls,
  rows,
  tidyEvidenceRows,
} from "./evidence-field";
import { IMAGE_MIME_TYPES } from "./Media";
import { fillSlug, slugField } from "./slug";
import { keepWhileUsed } from "./topic-references";
import { httpUrl } from "./url-field";

const NAME_MAX_LENGTH = 200;
const STATEMENT_MAX_LENGTH = 1000;
const MAX_ALIASES = 20;
const NO_STORE = { "Cache-Control": "no-store" };

type AliasRow = { name?: unknown };

function aliasNames(aliases: unknown): string[] {
  if (!Array.isArray(aliases)) return [];
  return aliases
    .map((alias: AliasRow) => alias?.name)
    .filter((name): name is string => typeof name === "string");
}

/** An individual's name followed by its aliases. */
function namesOf(doc: { name?: unknown; aliases?: unknown } | undefined) {
  if (!doc) return [];
  return [
    ...(typeof doc.name === "string" ? [doc.name] : []),
    ...aliasNames(doc.aliases),
  ];
}

function partialDate(value: unknown): true | string {
  if (value === null || value === undefined || value === "") return true;
  return typeof value === "string" && isPartialDate(value)
    ? true
    : "Use YYYY, YYYY-MM, or YYYY-MM-DD, only as precise as the source.";
}

/**
 * Keeps the stored name keys current and, when a name or alias is new to this
 * individual, refuses to save while another individual has the same name or
 * alias, until the admin confirms it is a different person.
 */
const checkDuplicates: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (typeof data.name === "string") data.nameKey = personNameKey(data.name);
  if (Array.isArray(data.aliases)) {
    data.aliases = data.aliases.map((alias: AliasRow) => ({
      ...alias,
      key: personNameKey(typeof alias?.name === "string" ? alias.name : ""),
    }));
  }

  const names = namesOf({
    name: data.name ?? originalDoc?.name,
    aliases: data.aliases ?? originalDoc?.aliases,
  });
  const previousNames = operation === "create" ? [] : namesOf(originalDoc);
  const previousKeys = nameKeys(previousNames);
  const added = nameKeys(names).filter((key) => !previousKeys.includes(key));
  if (added.length === 0 || data.notADuplicate === true) return data;

  await lockNameKeys(req, added);
  const duplicates = (
    await findPossibleDuplicates(req, {
      names,
      previousNames,
      excludeId: originalDoc?.id ? String(originalDoc.id) : null,
      exactOnly: true,
    })
  ).filter((match) => match.needsConfirmation);
  if (duplicates.length === 0) return data;

  const list = duplicates
    .map(
      (match) =>
        `${match.name} (same ${match.matchedOn === "alias" ? "alias" : "name"})`,
    )
    .join(", ");
  throw new ValidationError({
    collection: "individuals",
    errors: [
      {
        path: "notADuplicate",
        label: DIFFERENT_PERSON_LABEL,
        message: `Possible duplicate of ${list}. Check them; if this is a different person, tick "${DIFFERENT_PERSON_LABEL}" and save again.`,
      },
    ],
    req,
  });
};

/** Clears the fields that do not apply to each statement's evidence rows. */
const tidyStatements: CollectionBeforeChangeHook = ({ data }) => {
  if (Array.isArray(data.statements)) {
    data.statements = rows(data.statements).map((statement) => ({
      ...statement,
      evidence: tidyEvidenceRows(statement.evidence),
    }));
  }
  return data;
};

/** Asks the worker to copy the statements' evidence links to the Wayback Machine. */
const archiveStatementLinks: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  await queueLinkArchives(
    req,
    rows(doc.statements).flatMap((statement) =>
      evidenceLinkUrls(statement.evidence),
    ),
  );
};

const duplicateQuery = z.object({
  name: z.string().max(NAME_MAX_LENGTH),
  aliases: z.array(z.string().max(NAME_MAX_LENGTH)).max(MAX_ALIASES),
  wikidataId: z.string().refine(isWikidataId).optional(),
  exclude: z.uuid().optional(),
});

// GET /api/individuals/possible-duplicates?name=…&alias=…&wikidataId=…&exclude=…
// Powers the live warning in the admin form. Staff only, never cached. It
// shares the save check's rules, so `needsConfirmation` matches what the
// server will refuse.
const possibleDuplicatesEndpoint: Endpoint = {
  path: "/possible-duplicates",
  method: "get",
  handler: async (req) => {
    if (!isVerifiedStaff(req.user)) {
      return Response.json(
        { error: "Forbidden" },
        { status: 403, headers: NO_STORE },
      );
    }
    const params = req.searchParams;
    const query = duplicateQuery.safeParse({
      name: params.get("name") ?? "",
      aliases: params.getAll("alias"),
      wikidataId: params.get("wikidataId") || undefined,
      exclude: params.get("exclude") || undefined,
    });
    if (!query.success) {
      return Response.json(
        { error: "Invalid query" },
        { status: 400, headers: NO_STORE },
      );
    }
    const { name, aliases, wikidataId, exclude } = query.data;
    const saved = exclude
      ? await req.payload.findByID({
          collection: "individuals",
          id: exclude,
          select: { name: true, aliases: true },
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          req,
        })
      : null;
    const matches = await findPossibleDuplicates(req, {
      names: [name, ...aliases],
      previousNames: namesOf(saved ?? undefined),
      wikidataId,
      excludeId: exclude,
    });
    return Response.json({ matches }, { headers: NO_STORE });
  },
};

const audit = auditHooks({
  collection: "individuals",
  action: "individual",
  snapshot: (doc) => ({
    name: doc.name,
    slug: doc.slug,
    summary: doc.summary ?? null,
    bio: doc.bio ?? null,
    wikidataId: doc.wikidataId ?? null,
    photo: relationId(doc.photo),
    aliases: aliasNames(doc.aliases),
    countries: Array.isArray(doc.countries)
      ? doc.countries.map((row: Record<string, unknown>) => ({
          country: relationId(row.country),
          role: row.role ?? null,
          startDate: row.startDate ?? null,
          endDate: row.endDate ?? null,
        }))
      : [],
    links: Array.isArray(doc.links)
      ? doc.links.map((row: Record<string, unknown>) => ({
          label: row.label,
          url: row.url,
        }))
      : [],
    statements: rows(doc.statements).map((statement) => ({
      text: statement.text ?? null,
      evidence: rows(statement.evidence).map((row) => ({
        kind: row.kind ?? null,
        title: row.title ?? null,
        file: relationId(row.file),
        snippet: relationId(row.snippet),
        url: row.url ?? null,
        archiveUrl: row.archiveUrl ?? null,
        note: row.note ?? null,
      })),
      sources: rows(statement.sources).map((row) => ({
        reference: relationId(row.reference),
        passage: row.passage ?? null,
        locator: row.locator ?? null,
      })),
    })),
  }),
});

// F2: politicians, officials, experts, and others that topics are about or
// quote. Every published statement about a person needs evidence and a
// reference (AGENTS.md), so a public profile shows who they are, the
// published topics that name them, and only those of its statements that
// carry their own evidence and confirmed sources; the bio and country roles
// are staff notes (ADR 0007).
export const Individuals: CollectionConfig = {
  slug: "individuals",
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "summary", "updatedAt"],
    listSearchableFields: ["name", "summary"],
  },
  defaultSort: "name",
  access: {
    read: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  endpoints: [possibleDuplicatesEndpoint],
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      maxLength: NAME_MAX_LENGTH,
      admin: { description: "The name the person is best known by." },
    },
    {
      name: "aliases",
      type: "array",
      maxRows: MAX_ALIASES,
      labels: { singular: "Alias", plural: "Aliases" },
      admin: {
        description:
          "Other names and spellings: birth names, transliterations, initials.",
      },
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
          maxLength: NAME_MAX_LENGTH,
        },
        { name: "key", type: "text", index: true, admin: { hidden: true } },
      ],
    },
    {
      // Never stored: the admin's answer to the duplicate warning for this save.
      name: "notADuplicate",
      label: DIFFERENT_PERSON_LABEL,
      type: "checkbox",
      virtual: true,
      admin: {
        // Payload makes virtual fields read-only unless told otherwise.
        readOnly: false,
        components: {
          Field: "/components/admin/PossibleDuplicates#PossibleDuplicates",
        },
      },
    },
    {
      name: "summary",
      label: "Role or description",
      type: "text",
      maxLength: 160,
      admin: {
        description:
          "One line that tells people with the same name apart, such as 'Economist' or 'Minister of Finance'.",
      },
    },
    {
      name: "countries",
      type: "array",
      labels: { singular: "Country", plural: "Countries" },
      admin: {
        description:
          "Countries this person is linked to, their role there, and when. Seen by staff only; to say a role on the public profile, add it as a statement below, with its evidence and sources.",
      },
      fields: [
        {
          name: "country",
          type: "relationship",
          relationTo: "countries",
          required: true,
          index: true,
        },
        {
          name: "role",
          type: "text",
          maxLength: 120,
          admin: {
            description:
              "Such as 'Member of Parliament' or 'Central bank governor'.",
          },
        },
        {
          type: "row",
          fields: [
            {
              name: "startDate",
              label: "From",
              type: "text",
              validate: partialDate,
              admin: { placeholder: "YYYY, YYYY-MM, or YYYY-MM-DD" },
            },
            {
              name: "endDate",
              label: "To",
              type: "text",
              validate: (
                value: unknown,
                { siblingData }: { siblingData: Record<string, unknown> },
              ) => {
                const valid = partialDate(value);
                if (valid !== true || !value) return valid;
                const start = siblingData.startDate;
                return typeof start === "string" &&
                  isPartialDate(start) &&
                  !isPartialDateRangeValid(start, String(value))
                  ? "The end is before the start."
                  : true;
              },
              admin: {
                placeholder: "Empty while it continues",
              },
            },
          ],
        },
      ],
    },
    {
      name: "photo",
      type: "upload",
      relationTo: "media",
      filterOptions: { mimeType: { in: IMAGE_MIME_TYPES } },
      admin: {
        description:
          "Optional. Only a photo we may publish; record its licence and credit on the file.",
      },
    },
    {
      name: "bio",
      type: "textarea",
      maxLength: 5000,
      admin: {
        description:
          "Notes for staff, never shown publicly. What the public profile says goes under Statements, each with its evidence and sources.",
      },
    },
    {
      name: "statements",
      type: "array",
      labels: { singular: "Statement", plural: "Statements" },
      admin: {
        description:
          "What the public profile says about this person, one fact per statement. Each statement is shown only with its own evidence and sources, every source confirmed and every video found playable; until then it stays hidden, and the others are still shown.",
      },
      fields: [
        {
          name: "text",
          type: "textarea",
          required: true,
          maxLength: STATEMENT_MAX_LENGTH,
          admin: {
            description:
              "One fact, such as 'Minister of Finance from May 2019 to March 2022.' Say only what the evidence and sources below show.",
          },
        },
        evidenceField(
          "What shows the statement is true: an official document, an archived web page, a photo, or a video snippet. At least one.",
        ),
        {
          name: "sources",
          type: "array",
          labels: { singular: "Source", plural: "Sources" },
          admin: {
            description:
              "References that support the statement, each with the passage that does. At least one, all confirmed.",
          },
          fields: [
            {
              name: "reference",
              type: "relationship",
              relationTo: "references",
              required: true,
              index: true,
            },
            {
              name: "passage",
              type: "textarea",
              required: true,
              maxLength: 2000,
              admin: {
                description:
                  "The words in the reference that support the statement, quoted exactly.",
              },
            },
            {
              name: "locator",
              label: "Page or section",
              type: "text",
              maxLength: 100,
            },
          ],
        },
      ],
    },
    {
      name: "links",
      type: "array",
      labels: { singular: "Link", plural: "Links" },
      admin: { description: "Official pages and other profiles." },
      fields: [
        { name: "label", type: "text", required: true, maxLength: 120 },
        {
          name: "url",
          label: "URL",
          type: "text",
          required: true,
          maxLength: URL_MAX_LENGTH,
          validate: httpUrl,
        },
      ],
    },
    {
      name: "wikidataId",
      label: "Wikidata ID",
      type: "text",
      unique: true,
      index: true,
      // Blank means unknown; stored as null so the unique index allows many.
      // A copy is a different person, so it does not keep the id.
      hooks: {
        beforeDuplicate: [() => null],
        beforeValidate: [
          ({ value }) =>
            typeof value === "string" && value.trim() ? value.trim() : null,
        ],
      },
      validate: (value: unknown) =>
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "string" && isWikidataId(value))
          ? true
          : "Use the item id, like Q42.",
      admin: {
        position: "sidebar",
        description: "Optional. Tells people with the same name apart.",
      },
    },
    slugField,
    { name: "nameKey", type: "text", index: true, admin: { hidden: true } },
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.individuals, {
    beforeValidate: [fillSlug("individuals")],
    beforeDelete: [
      keepWhileUsed("individual", [
        { collection: "topics", field: "people.individual" },
        { collection: "topics", field: "linkedIndividuals" },
        { collection: "snippets", field: "speaker" },
      ]),
    ],
    beforeChange: [checkDuplicates, tidyStatements],
    afterChange: [archiveStatementLinks, ...audit.afterChange],
    afterDelete: audit.afterDelete,
  }),
};
