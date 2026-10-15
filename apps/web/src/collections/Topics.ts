import {
  changeNoteRequired,
  TOPIC_PERSON_ROLES,
  TOPIC_STATES,
  type TopicChangeKind,
  type TopicSave,
  topicChangeKind,
  topicStateAfterSave,
} from "@countrytopics/domain";
import { isDeepStrictEqual } from "node:util";
import {
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
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

// Fields compared to say which ones a draft save changed, in the audit log.
const AUDITED_FIELDS = [
  "title",
  "summary",
  "body",
  "countries",
  "category",
  "tags",
  "people",
  "readyForReview",
  "archived",
  "slug",
] as const;

type PendingChange = { kind: TopicChangeKind; note: string };
const PENDING_CHANGES = "topicChanges";
const NEW_TOPIC = "new";

/**
 * Change log entries waiting for afterChange, keyed by topic: a bulk publish
 * saves several topics at once on one request. Always reached through
 * req.context, because nested local API calls replace the context object
 * (copying its keys).
 */
function pendingChanges(req: PayloadRequest): Map<string, PendingChange> {
  const existing: unknown = req.context[PENDING_CHANGES];
  if (existing instanceof Map) return existing;
  const created = new Map<string, PendingChange>();
  req.context[PENDING_CHANGES] = created;
  return created;
}

function refuse(
  req: PayloadRequest,
  path: string,
  label: string,
  message: string,
): never {
  throw new ValidationError({
    collection: "topics",
    errors: [{ path, label, message }],
    req,
  });
}

/**
 * Blocks, before anything is written, the operations that would take a
 * published topic offline or replace it without a change log entry:
 * - Unpublishing (one topic or in bulk). A published topic is archived instead.
 * - Restoring a version over a published topic. It may be restored only as a
 *   draft, and then published with a change note.
 * A duplicate becomes a fresh draft; applyWorkflow gives it no publication
 * history.
 */
const guardLiveVersion: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  const draft = "draft" in args && args.draft === true;
  const data: unknown = "data" in args ? args.data : undefined;
  const status =
    data && typeof data === "object" && "_status" in data
      ? data._status
      : undefined;
  if (
    (operation === "update" || operation === "updateByID") &&
    !draft &&
    status === "draft"
  ) {
    refuse(
      req,
      "_status",
      "Status",
      "Topics are not unpublished. To take one out of lists, tick Archived, add a change note, and publish.",
    );
  }
  if (operation === "restoreVersion" && !draft && "id" in args && args.id) {
    const version = await req.payload.findVersionByID({
      collection: "topics",
      id: String(args.id),
      depth: 0,
      overrideAccess: true,
      req,
    });
    const topicId = relationId(version?.parent);
    const topic = topicId
      ? await req.payload.findByID({
          collection: "topics",
          id: topicId,
          depth: 0,
          select: { firstPublishedAt: true },
          disableErrors: true,
          overrideAccess: true,
          req,
        })
      : null;
    if (topic?.firstPublishedAt) {
      refuse(
        req,
        "changeNote",
        "Change note",
        "This topic is published, so a version can only be restored as a draft. Then publish it with a change note.",
      );
    }
  }
  if (
    operation === "create" &&
    "duplicateFromID" in args &&
    args.duplicateFromID !== undefined &&
    args.duplicateFromID !== null
  ) {
    const copied = data && typeof data === "object" ? data : {};
    return {
      ...args,
      draft: true,
      data: { ...copied, readyForReview: false, archived: false },
    };
  }
  return args;
};

/**
 * Applies the workflow on every save: records who edited, keeps the state, and
 * on publish checks the content and change note and prepares the change log
 * entry.
 */
const applyWorkflow: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const stored = operation === "update" ? originalDoc : undefined;
  // The system fields come from the stored document and this hook only.
  data.lastEditedBy = req.user?.id ?? null;
  data.state = stored?.state ?? "draft";
  data.firstPublishedAt = stored?.firstPublishedAt ?? null;
  data.lastPublishedAt = stored?.lastPublishedAt ?? null;
  // A restore reaching this point is a draft restore (guardLiveVersion refuses
  // the others), though its data still carries the old version's status.
  if (req.context.isRestoringVersion) return data;

  const key = stored?.id ? String(stored.id) : NEW_TOPIC;
  pendingChanges(req).delete(key);
  const publishing = data._status === "published";
  const previouslyPublished = Boolean(stored?.firstPublishedAt);

  // The live version, not the latest draft, says whether visitors currently
  // see the topic as archived.
  const live =
    publishing && previouslyPublished && stored?.id
      ? await req.payload.findByID({
          collection: "topics",
          id: stored.id,
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
    archived: Boolean(data.archived ?? stored?.archived),
    readyForReview: Boolean(data.readyForReview ?? stored?.readyForReview),
  };

  const note =
    typeof data.changeNote === "string" ? data.changeNote.trim() : "";
  if (changeNoteRequired(save) && !note) {
    refuse(
      req,
      "changeNote",
      "Change note",
      "Say what changed and why. The note is shown in the topic's public change log.",
    );
  }
  if (publishing && !richTextHasText(data.body ?? stored?.body)) {
    refuse(req, "body", "Body", "Write the topic before publishing.");
  }

  const state = topicStateAfterSave(save);
  if (state) data.state = state;
  const kind = topicChangeKind(save);
  if (kind) {
    const now = new Date().toISOString();
    data.firstPublishedAt = stored?.firstPublishedAt ?? now;
    data.lastPublishedAt = now;
    data.readyForReview = false;
    // Only a first publish can have no note (changeNoteRequired).
    pendingChanges(req).set(key, {
      kind,
      note: note || (kind === "archived" ? "Archived." : "First published."),
    });
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

/** A comparable form of a field: related documents reduced to their ids. */
function comparable(field: (typeof AUDITED_FIELDS)[number], value: unknown) {
  if (field === "countries" || field === "tags")
    return Array.isArray(value) ? value.map(relationId) : [];
  if (field === "category") return relationId(value);
  if (field === "people")
    return Array.isArray(value)
      ? value.map((row: { individual?: unknown; role?: unknown }) => ({
          individual: relationId(row?.individual),
          role: row?.role ?? null,
        }))
      : [];
  return value ?? null;
}

/**
 * Audits every save: creates, publishes (with a change log entry), draft saves
 * (which fields changed), and draft restores.
 */
const recordChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const target = { targetCollection: "topics", targetId: String(doc.id) };
  if (operation === "create") {
    await recordAudit(req, {
      action: "topic.created",
      ...target,
      details: { title: doc.title },
    });
  }
  const key = operation === "create" ? NEW_TOPIC : String(doc.id);
  const pending = pendingChanges(req).get(key);
  pendingChanges(req).delete(key);
  const latest = await latestVersion(req, doc.id);
  const version = latest ? String(latest.id) : null;

  if (pending) {
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
      ...target,
      details: { title: doc.title, note: pending.note, version },
    });
    return;
  }
  if (operation !== "update") return;
  if (req.context.isRestoringVersion) {
    await recordAudit(req, {
      action: "topic.restored_as_draft",
      ...target,
      details: { title: doc.title, version },
    });
    return;
  }
  const fields = AUDITED_FIELDS.filter(
    (field) =>
      !isDeepStrictEqual(
        comparable(field, previousDoc?.[field]),
        comparable(field, doc[field]),
      ),
  );
  await recordAudit(req, {
    action: "topic.draft_saved",
    ...target,
    details: { title: doc.title, fields, version },
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
    beforeOperation: [guardLiveVersion],
    beforeChange: [applyWorkflow],
    afterChange: [recordChange],
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
