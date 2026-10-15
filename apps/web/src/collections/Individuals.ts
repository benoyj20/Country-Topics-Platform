import {
  isHttpUrl,
  isPartialDate,
  isPartialDateRangeValid,
  isWikidataId,
  personNameKey,
} from "@countrytopics/domain";
import {
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
import {
  findPossibleDuplicates,
  lockNameKeys,
  nameKeys,
} from "@/individuals/duplicates";
import { DIFFERENT_PERSON_LABEL } from "@/individuals/labels";

import { fillSlug, slugField } from "./slug";
import { keepWhileUsedByTopics } from "./topic-references";

const NAME_MAX_LENGTH = 200;
const MAX_ALIASES = 20;
const URL_MAX_LENGTH = 2048;
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

// F2: politicians, officials, experts, and others that topics are about or
// quote. Profiles are not public yet (public pages come in week 7), and every
// published statement about a person needs evidence (AGENTS.md).
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
          "Countries this person is linked to, their role there, and when.",
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
      name: "bio",
      type: "textarea",
      maxLength: 5000,
      admin: {
        description:
          "Plain text. Keep to what the linked evidence and references support.",
      },
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
          // A custom validate replaces Payload's, so the length is checked here.
          validate: (value: unknown) =>
            typeof value === "string" &&
            value.length <= URL_MAX_LENGTH &&
            isHttpUrl(value)
              ? true
              : "Enter a full link starting with https:// or http://, at most 2048 characters.",
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
  hooks: {
    beforeValidate: [fillSlug("individuals")],
    beforeDelete: [keepWhileUsedByTopics("people.individual", "individual")],
    beforeChange: [checkDuplicates],
    ...auditHooks({
      collection: "individuals",
      action: "individual",
      snapshot: (doc) => ({
        name: doc.name,
        slug: doc.slug,
        summary: doc.summary ?? null,
        bio: doc.bio ?? null,
        wikidataId: doc.wikidataId ?? null,
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
      }),
    }),
  },
};
