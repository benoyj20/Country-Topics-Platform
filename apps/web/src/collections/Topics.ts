import {
  changeNoteRequired,
  TOPIC_PERSON_ROLES,
  TOPIC_STATES,
  type TopicChangeKind,
  type TopicSave,
  topicChangeKind,
  topicStateAfterSave,
} from "@countrytopics/domain";
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type PayloadRequest,
  ValidationError,
} from "payload";

import {
  isVerifiedAdmin,
  verifiedAdminsOnly,
  verifiedStaffOnly,
} from "@/access";
import { recordAudit, relationId } from "@/audit";
import { richTextHasText } from "@/editor";

import { fillSlug, slugField } from "./slug";

const CHANGE_NOTE_MAX_LENGTH = 500;
const FIRST_PUBLISH_NOTES: Record<TopicChangeKind, string> = {
  published: "First published.",
  archived: "Archived.",
  updated: "Updated.",
  restored: "Restored.",
};

const STATE_LABELS: Record<(typeof TOPIC_STATES)[number], string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  updated: "Updated",
  archived: "Archived",
};

// Set only by the hooks below; never from the request.
const systemField = {
  access: { create: () => false, update: () => false },
  admin: { readOnly: true, position: "sidebar" },
} as const;

type PendingChange = { kind: TopicChangeKind; note: string };
const PENDING_CHANGE = "topicChange";

/**
 * Applies the workflow on every save: records who edited, keeps the state, and
 * on publish checks the change note and prepares the change log entry.
 */
const applyWorkflow: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  // The system fields come from the stored document and this hook only.
  data.lastEditedBy = req.user?.id ?? null;
  data.state = originalDoc?.state ?? "draft";
  data.firstPublishedAt = originalDoc?.firstPublishedAt ?? null;
  data.lastPublishedAt = originalDoc?.lastPublishedAt ?? null;
  // A restore passes the old version's data, status included, and only later
  // applies "restore as draft", so it is treated as a draft here;
  // guardLiveVersion undoes a restore that ends up published.
  if (req.context.isRestoringVersion) return data;
  const publishing = data._status === "published";
  const previouslyPublished = Boolean(originalDoc?.firstPublishedAt);

  // The live version, not the latest draft, says whether visitors currently
  // see the topic as archived.
  const live =
    publishing && previouslyPublished && originalDoc?.id
      ? await req.payload.findByID({
          collection: "topics",
          id: originalDoc.id,
          draft: false,
          depth: 0,
          select: { state: true },
          overrideAccess: true,
          req,
        })
      : null;
  const save: TopicSave = {
    publishing,
    previouslyPublished,
    previouslyArchived: live?.state === "archived",
    archived: Boolean(data.archived ?? originalDoc?.archived),
    readyForReview: Boolean(data.readyForReview ?? originalDoc?.readyForReview),
  };

  const note =
    typeof data.changeNote === "string" ? data.changeNote.trim() : "";
  if (changeNoteRequired(save) && !note) {
    throw new ValidationError({
      collection: "topics",
      errors: [
        {
          path: "changeNote",
          label: "Change note",
          message:
            "Say what changed and why. The note is shown in the topic's public change log.",
        },
      ],
      req,
    });
  }

  if (publishing && !richTextHasText(data.body ?? originalDoc?.body)) {
    throw new ValidationError({
      collection: "topics",
      errors: [
        {
          path: "body",
          label: "Body",
          message: "Write the topic before publishing.",
        },
      ],
      req,
    });
  }

  const state = topicStateAfterSave(save);
  if (state) data.state = state;
  const kind = topicChangeKind(save);
  if (kind) {
    const now = new Date().toISOString();
    data.firstPublishedAt = originalDoc?.firstPublishedAt ?? now;
    data.lastPublishedAt = now;
    data.readyForReview = false;
    const pending: PendingChange = {
      kind,
      note: note || FIRST_PUBLISH_NOTES[kind],
    };
    // req.context, not the hook's `context`: the lookup above replaces it.
    req.context[PENDING_CHANGE] = pending;
  }
  return data;
};

/** The version the current operation saved last. */
async function latestVersion(req: PayloadRequest, topic: string | number) {
  const { docs } = await req.payload.findVersions({
    collection: "topics",
    where: { parent: { equals: topic } },
    sort: "-updatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return docs[0] ?? null;
}

function refuse(req: PayloadRequest, path: string, message: string): never {
  throw new ValidationError({
    collection: "topics",
    errors: [
      {
        path,
        label: path === "changeNote" ? "Change note" : "Status",
        message,
      },
    ],
    req,
  });
}

/**
 * Keeps the live version honest; throwing here rolls the save back.
 * - A restored version may go live only through a normal publish with a change
 *   note. The version just saved tells whether the restore published: after a
 *   draft restore, `doc` is still the live document.
 * - A published topic is never unpublished, which would take it offline with
 *   no change log entry; it is archived instead.
 */
const guardLiveVersion: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context.isRestoringVersion) {
    const restored = await latestVersion(req, doc.id);
    if (restored?.version._status === "published") {
      refuse(
        req,
        "changeNote",
        "Restore the version as a draft, then publish it with a change note.",
      );
    }
    return doc;
  }
  if (!doc.firstPublishedAt) return doc;
  const live = await req.payload.findByID({
    collection: "topics",
    id: doc.id,
    draft: false,
    depth: 0,
    select: { _status: true },
    overrideAccess: true,
    req,
  });
  if (live._status !== "published") {
    refuse(
      req,
      "_status",
      "A published topic cannot be unpublished. To take it out of lists, tick Archived, add a change note, and publish.",
    );
  }
  return doc;
};

/** Writes the change log entry and the audit entry for a publish. */
const recordPublish: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation === "create") {
    await recordAudit(req, {
      action: "topic.created",
      targetCollection: "topics",
      targetId: String(doc.id),
      details: { title: doc.title },
    });
  }
  const pending = req.context[PENDING_CHANGE] as PendingChange | undefined;
  if (!pending) return;
  delete req.context[PENDING_CHANGE];

  const latest = await latestVersion(req, doc.id);
  const version = latest ? String(latest.id) : null;
  await req.payload.create({
    collection: "topic-changes",
    data: {
      topic: doc.id,
      kind: pending.kind,
      note: pending.note,
      version,
      actor: req.user?.id ?? null,
    },
    overrideAccess: true,
    req,
  });
  await recordAudit(req, {
    action: `topic.${pending.kind}`,
    targetCollection: "topics",
    targetId: String(doc.id),
    details: { title: doc.title, note: pending.note, version },
  });
};

// F3: an event, policy, or public claim about one or more countries. Every save
// is kept as a version; visitors (from week 7) see only the published one.
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
    // Draft saves skip the required-field checks; publishing runs them.
    drafts: { validate: false },
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
    { name: "title", type: "text", required: true, maxLength: 200 },
    {
      name: "summary",
      type: "textarea",
      required: true,
      maxLength: 500,
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
              options: TOPIC_PERSON_ROLES.map((role) => ({
                label: role[0]?.toUpperCase() + role.slice(1),
                value: role,
              })),
            },
          ],
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
      admin: {
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
        label: STATE_LABELS[value],
        value,
      })),
      ...systemField,
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
    beforeChange: [applyWorkflow],
    afterChange: [guardLiveVersion, recordPublish],
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
