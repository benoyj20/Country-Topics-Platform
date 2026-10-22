import {
  isPartialDate,
  normalizeDoi,
  normalizeIsbn,
  PARTIAL_DATE_MESSAGE,
  REFERENCE_AUTHORS_MAX_LENGTH,
  REFERENCE_CHECK_LABELS,
  REFERENCE_CHECK_STATUSES,
  REFERENCE_KIND_LABELS,
  REFERENCE_KINDS,
  REFERENCE_SOURCE_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  URL_MAX_LENGTH,
} from "@countrytopics/domain";
import { SourceUnavailableError } from "@countrytopics/sources";
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Endpoint,
} from "payload";

import {
  isVerifiedAdmin,
  verifiedAdminsOnly,
  verifiedStaffOnly,
} from "@/access";
import { auditHooks } from "@/audit";
import { queueLinkArchives, queueReferenceCheck } from "@/content-jobs";
import { PUBLIC_TAGS, purgeOnChange } from "@/public-cache";
import { bibliography } from "@/sources";

import { keepWhileUsed } from "./topic-references";
import { httpUrl } from "./url-field";

const NO_STORE = { "Cache-Control": "no-store" };

// Set only by the hooks below and the worker; never from the request.
const systemField = {
  access: { create: () => false, update: () => false },
  admin: { readOnly: true, position: "sidebar" },
} as const;

type Identifiers = {
  doi: string | null;
  isbn: string | null;
  url: string | null;
};

function identifiersOf(doc: Record<string, unknown> | undefined): Identifiers {
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : null;
  return { doi: text(doc?.doi), isbn: text(doc?.isbn), url: text(doc?.url) };
}

/** Blank becomes null (so the unique index allows many); valid input is normalised. */
function normalized(normalize: (value: string) => string | null) {
  return ({ value }: { value?: unknown }) => {
    if (typeof value !== "string" || !value.trim()) return null;
    return normalize(value) ?? value.trim();
  };
}

/**
 * Marks a reference "being checked" whenever its identifiers change, and on
 * any save while it is not confirmed (so saving again retries). The check
 * itself runs in the worker.
 */
const markForCheck: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  const stored = operation === "update" ? originalDoc : undefined;
  const next = identifiersOf({
    doi: data.doi === undefined ? stored?.doi : data.doi,
    isbn: data.isbn === undefined ? stored?.isbn : data.isbn,
    url: data.url === undefined ? stored?.url : data.url,
  });
  const unchanged =
    stored && JSON.stringify(identifiersOf(stored)) === JSON.stringify(next);
  if (unchanged && stored.checkStatus === "resolved") {
    data.checkStatus = stored.checkStatus;
    data.checkMessage = stored.checkMessage ?? null;
    data.checkedAt = stored.checkedAt ?? null;
    data.checkRequestedAt = stored.checkRequestedAt ?? null;
    return data;
  }
  data.checkStatus = "pending";
  data.checkMessage = null;
  data.checkedAt = null;
  // The queued job carries the same time, so the worker can tell this save
  // from the reference as it was before it committed (content-store.ts).
  data.checkRequestedAt = new Date().toISOString();
  return data;
};

const queueChecks: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (doc.checkStatus === "pending" && doc.checkRequestedAt) {
    await queueReferenceCheck(req, {
      referenceId: String(doc.id),
      requestedAt: doc.checkRequestedAt,
      ...identifiersOf(doc),
    });
  }
  // Web pages disappear; keep a copy of the cited one.
  await queueLinkArchives(req, [doc.url]);
};

// GET /api/references/lookup?doi=… or ?isbn=…
// Fills in the admin form from Crossref, the DOI system, or Open Library. It
// runs in the request (bounded by SOURCE_TIMEOUT_MS) because
// the admin is waiting for the answer; whether a reference is confirmed is
// decided by the worker's check after saving.
const lookupEndpoint: Endpoint = {
  path: "/lookup",
  method: "get",
  handler: async (req) => {
    if (!isVerifiedAdmin(req.user)) {
      return Response.json(
        { error: "Forbidden" },
        { status: 403, headers: NO_STORE },
      );
    }
    const doiInput = req.searchParams.get("doi");
    const isbnInput = req.searchParams.get("isbn");
    const doi = doiInput ? normalizeDoi(doiInput) : null;
    const isbn = isbnInput ? normalizeIsbn(isbnInput) : null;
    if (!doi && !isbn) {
      return Response.json(
        { error: "Enter a valid DOI (10.…) or ISBN (10 or 13 digits)." },
        { status: 400, headers: NO_STORE },
      );
    }
    try {
      const result = doi
        ? await bibliography().lookupDoi(doi)
        : await bibliography().lookupIsbn(isbn ?? "");
      return Response.json({ ...result, doi, isbn }, { headers: NO_STORE });
    } catch (error) {
      if (!(error instanceof SourceUnavailableError)) throw error;
      return Response.json(
        {
          error: `${error.message} Try again, or fill in the details by hand.`,
        },
        { status: 503, headers: NO_STORE },
      );
    }
  },
};

const audit = auditHooks({
  collection: "references",
  action: "reference",
  snapshot: (doc) => ({
    title: doc.title,
    kind: doc.kind,
    doi: doc.doi ?? null,
    isbn: doc.isbn ?? null,
    url: doc.url ?? null,
    authors: doc.authors ?? null,
    containerTitle: doc.containerTitle ?? null,
    publisher: doc.publisher ?? null,
    publishedDate: doc.publishedDate ?? null,
  }),
});

// F3 references: papers, books, reports, and web pages that topics cite. One
// record per work, reused by every topic that cites it. Every edit is kept
// as a version, because published topics rely on these records.
export const References: CollectionConfig = {
  slug: "references",
  admin: {
    group: "Content",
    useAsTitle: "title",
    defaultColumns: ["title", "kind", "checkStatus", "updatedAt"],
    listSearchableFields: ["title", "authors", "doi", "isbn"],
  },
  defaultSort: "-updatedAt",
  versions: { maxPerDoc: 0 },
  access: {
    read: verifiedStaffOnly,
    readVersions: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    delete: verifiedAdminsOnly,
  },
  endpoints: [lookupEndpoint],
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "doi",
          label: "DOI",
          type: "text",
          unique: true,
          index: true,
          hooks: { beforeValidate: [normalized(normalizeDoi)] },
          validate: (value: unknown) =>
            value === null ||
            value === undefined ||
            (typeof value === "string" && normalizeDoi(value) === value)
              ? true
              : "Enter a DOI like 10.1234/abcd, or a doi.org link.",
          admin: { placeholder: "10.…" },
        },
        {
          name: "isbn",
          label: "ISBN",
          type: "text",
          index: true,
          hooks: { beforeValidate: [normalized(normalizeIsbn)] },
          validate: (value: unknown) =>
            value === null ||
            value === undefined ||
            (typeof value === "string" && normalizeIsbn(value) === value)
              ? true
              : "Enter an ISBN-10 or ISBN-13; the check digit must match.",
        },
      ],
    },
    {
      name: "url",
      label: "Link",
      type: "text",
      maxLength: URL_MAX_LENGTH,
      hooks: {
        beforeValidate: [
          ({ value }) =>
            typeof value === "string" && value.trim() ? value.trim() : null,
        ],
      },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: Record<string, unknown> },
      ) => {
        if (typeof value === "string") return httpUrl(value);
        return siblingData.doi || siblingData.isbn
          ? true
          : "Give a DOI, an ISBN, or a link, so the reference can be checked.";
      },
      admin: {
        description:
          "Where to read it: the publisher's page or the report itself. Needed when there is no DOI or ISBN.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "kind",
          type: "select",
          required: true,
          defaultValue: "article",
          options: REFERENCE_KINDS.map((value) => ({
            value,
            label: REFERENCE_KIND_LABELS[value],
          })),
        },
        {
          name: "publishedDate",
          label: "Published",
          type: "text",
          validate: (value: unknown) =>
            value === null ||
            value === undefined ||
            value === "" ||
            (typeof value === "string" && isPartialDate(value))
              ? true
              : PARTIAL_DATE_MESSAGE,
          admin: { placeholder: "YYYY, YYYY-MM, or YYYY-MM-DD" },
        },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
      maxLength: REFERENCE_TITLE_MAX_LENGTH,
    },
    {
      name: "authors",
      type: "textarea",
      maxLength: REFERENCE_AUTHORS_MAX_LENGTH,
      admin: { description: "One per line, as printed." },
    },
    {
      type: "row",
      fields: [
        {
          name: "containerTitle",
          label: "Journal, book, or website",
          type: "text",
          maxLength: REFERENCE_SOURCE_MAX_LENGTH,
        },
        {
          name: "publisher",
          type: "text",
          maxLength: REFERENCE_SOURCE_MAX_LENGTH,
        },
      ],
    },
    {
      name: "checkStatus",
      label: "Check",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: REFERENCE_CHECK_STATUSES.map((value) => ({
        value,
        label: REFERENCE_CHECK_LABELS[value],
      })),
      ...systemField,
      admin: {
        ...systemField.admin,
        description:
          "Whether the DOI, ISBN, and link exist. Topics cite only confirmed references when published. Save again to retry a check.",
      },
    },
    {
      name: "checkMessage",
      label: "Check result",
      type: "text",
      ...systemField,
    },
    { name: "checkedAt", label: "Checked", type: "date", ...systemField },
    {
      // When the current check was asked for; set with checkStatus.
      name: "checkRequestedAt",
      type: "date",
      ...systemField,
      admin: { ...systemField.admin, hidden: true },
    },
  ],
  hooks: purgeOnChange(PUBLIC_TAGS.references, {
    beforeDelete: [
      keepWhileUsed("reference", [
        { collection: "topics", field: "references.reference" },
        { collection: "individuals", field: "statements.sources.reference" },
      ]),
    ],
    beforeChange: [markForCheck],
    afterChange: [queueChecks, ...audit.afterChange],
    afterDelete: audit.afterDelete,
  }),
};
