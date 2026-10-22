import {
  CHANGE_NOTE_MAX_LENGTH,
  CLAIM_STANCES,
  LOCATOR_MAX_LENGTH,
  PASSAGE_MAX_LENGTH,
  PERSON_ROLE_LABELS,
  STANCE_LABELS,
  TOPIC_PERSON_ROLES,
  TOPIC_STATE_LABELS,
  TOPIC_AUTOSAVE_INTERVAL_MS,
  TOPIC_STATES,
  TOPIC_SUMMARY_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
} from "@countrytopics/domain";
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
} from "payload";

import {
  isVerifiedAdmin,
  verifiedAdminsOnly,
  verifiedStaffOnly,
} from "@/access";
import { recordAudit, relationId } from "@/audit";
import { queueLinkArchives } from "@/content-jobs";
import { recordBodyLinks } from "@/topics/body-links";
import { recordChange } from "@/topics/change-log";
import { applyWorkflow, guardLiveVersion } from "@/topics/workflow";

import {
  evidenceField,
  evidenceLinkUrls,
  tidyEvidenceRows,
} from "./evidence-field";
import { fillSlug, slugField } from "./slug";

// The topics' fields and access. How a save is checked, published, and
// logged is in src/topics: workflow.ts, publish-checks.ts, change-log.ts,
// and body-links.ts.

// Set only by the hooks (src/topics); never from the request.
const systemField = {
  access: { create: () => false, update: () => false },
  admin: { readOnly: true, position: "sidebar" },
} as const;

/** Clears the fields that do not apply to each evidence row's kind. */
const tidyEvidence: CollectionBeforeChangeHook = ({ data }) => {
  if (Array.isArray(data.evidence))
    data.evidence = tidyEvidenceRows(data.evidence);
  return data;
};

/** Asks the worker to copy evidence links to the Wayback Machine, from the first draft on. */
const archiveEvidenceLinks: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  await queueLinkArchives(req, evidenceLinkUrls(doc.evidence));
};

// F3: an event, policy, or public claim about one or more countries. Every save
// is kept as a version; visitors see only the published one.
export const Topics: CollectionConfig = {
  slug: "topics",
  admin: {
    group: "Content",
    useAsTitle: "title",
    defaultColumns: ["title", "state", "countries", "updatedAt"],
    listSearchableFields: ["title", "summary"],
  },
  defaultSort: "-updatedAt",
  versions: {
    drafts: {
      // Draft saves skip the required-field checks; publishing runs them.
      validate: false,
      // The editor's own drafts while they type, kept as one version that
      // each autosave updates, until they save or publish.
      autosave: { interval: TOPIC_AUTOSAVE_INTERVAL_MS },
    },
    // Keep every version: published content and its history are never lost.
    maxPerDoc: 0,
  },
  access: {
    read: verifiedStaffOnly,
    readVersions: verifiedStaffOnly,
    create: verifiedAdminsOnly,
    update: verifiedAdminsOnly,
    // Only topics that were never published; published ones are archived.
    delete: ({ req }) =>
      isVerifiedAdmin(req.user)
        ? { firstPublishedAt: { exists: false } }
        : false,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      maxLength: TOPIC_TITLE_MAX_LENGTH,
    },
    {
      name: "summary",
      type: "textarea",
      required: true,
      maxLength: TOPIC_SUMMARY_MAX_LENGTH,
      admin: {
        description: "One or two sentences, shown in lists and previews.",
      },
    },
    {
      // No custom validate: it would replace the editor's own checks of each
      // node, such as link URLs. The publish hook checks for text.
      name: "body",
      type: "richText",
      required: true,
    },
    {
      type: "row",
      fields: [
        {
          name: "countries",
          type: "relationship",
          relationTo: "countries",
          hasMany: true,
          required: true,
          index: true,
        },
        {
          name: "category",
          type: "relationship",
          relationTo: "categories",
          index: true,
        },
      ],
    },
    { name: "tags", type: "relationship", relationTo: "tags", hasMany: true },
    {
      name: "people",
      label: "Individuals",
      type: "array",
      labels: { singular: "Individual", plural: "Individuals" },
      admin: {
        description:
          "Who the topic is about (subject), who is quoted (speaker), who provided information (source), or who is only mentioned.",
      },
      validate: (rows: unknown) => {
        const seen = new Set<string>();
        for (const row of Array.isArray(rows) ? rows : []) {
          const key = `${relationId(row?.individual)}:${row?.role}`;
          if (seen.has(key)) return "List each individual once per role.";
          seen.add(key);
        }
        return true;
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "individual",
              type: "relationship",
              relationTo: "individuals",
              required: true,
              index: true,
            },
            {
              name: "role",
              type: "select",
              required: true,
              defaultValue: "subject",
              options: TOPIC_PERSON_ROLES.map((value) => ({
                value,
                label: PERSON_ROLE_LABELS[value],
              })),
            },
          ],
        },
      ],
    },
    evidenceField(
      "What shows it happened: documents, images, web pages (copied to the Wayback Machine), and video snippets. A topic that names individuals needs at least one.",
    ),
    {
      name: "references",
      type: "array",
      labels: { singular: "Reference", plural: "References" },
      admin: {
        description:
          "Papers, books, reports, and pages that support or contradict the topic, each with the passage that does. Only confirmed references can be published.",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "reference",
              type: "relationship",
              relationTo: "references",
              required: true,
              index: true,
            },
            {
              name: "stance",
              type: "select",
              required: true,
              defaultValue: "supports",
              options: CLAIM_STANCES.map((value) => ({
                value,
                label: STANCE_LABELS[value],
              })),
            },
          ],
        },
        {
          name: "passage",
          type: "textarea",
          required: true,
          maxLength: PASSAGE_MAX_LENGTH,
          admin: {
            description:
              "The words in the reference that support, contradict, or explain the topic, quoted exactly.",
          },
        },
        {
          name: "locator",
          label: "Page or section",
          type: "text",
          maxLength: LOCATOR_MAX_LENGTH,
        },
      ],
    },
    {
      name: "changeNote",
      label: "Change note",
      type: "textarea",
      // Never stored: it becomes the change log entry of this publish. It
      // reads back empty, so the form clears after a save and an old note is
      // never reused for the next publish.
      virtual: true,
      hooks: { afterRead: [() => null] },
      maxLength: CHANGE_NOTE_MAX_LENGTH,
      // Payload makes virtual fields read-only and skips their checks unless
      // told otherwise, so both are set here.
      validate: (value: unknown) =>
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.length <= CHANGE_NOTE_MAX_LENGTH)
          ? true
          : `Keep the note to ${CHANGE_NOTE_MAX_LENGTH} characters.`,
      admin: {
        readOnly: false,
        position: "sidebar",
        description:
          "Required when publishing changes to a published topic. Shown in its public change log.",
      },
    },
    {
      name: "readyForReview",
      label: "Ready for review",
      type: "checkbox",
      admin: {
        position: "sidebar",
        description: "Marks a draft as finished and waiting to be checked.",
      },
    },
    {
      name: "archived",
      type: "checkbox",
      admin: {
        position: "sidebar",
        description:
          "Takes the topic out of lists when published; its page and history stay.",
      },
    },
    slugField,
    {
      name: "state",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: TOPIC_STATES.map((value) => ({
        label: TOPIC_STATE_LABELS[value],
        value,
      })),
      ...systemField,
    },
    {
      name: "linkedIndividuals",
      type: "relationship",
      relationTo: "individuals",
      hasMany: true,
      // Kept by recordBodyLinks from the body's links; not shown in the form.
      access: systemField.access,
      admin: { hidden: true },
    },
    { name: "firstPublishedAt", type: "date", index: true, ...systemField },
    { name: "lastPublishedAt", type: "date", ...systemField },
    {
      name: "lastEditedBy",
      type: "relationship",
      relationTo: "users",
      ...systemField,
    },
  ],
  hooks: {
    beforeValidate: [fillSlug("topics", "title")],
    beforeOperation: [guardLiveVersion],
    beforeChange: [tidyEvidence, recordBodyLinks, applyWorkflow],
    afterChange: [recordChange, archiveEvidenceLinks],
    afterDelete: [
      async ({ doc, req }) => {
        await recordAudit(req, {
          action: "topic.deleted",
          targetCollection: "topics",
          targetId: String(doc.id),
          details: { title: doc.title, slug: doc.slug },
        });
      },
    ],
  },
};
