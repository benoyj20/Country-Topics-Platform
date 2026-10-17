import {
  CLAIM_STANCES,
  changeNoteRequired,
  evidenceProblems,
  type SnippetEvidence,
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
import {
  PERSON_ROLE_LABELS,
  STANCE_LABELS,
  TOPIC_STATE_LABELS,
} from "@/content-labels";
import { queueLinkArchives } from "@/content-jobs";
import { richTextHasText, richTextLinkedIds, richTextLinksTo } from "@/editor";
import { PUBLIC_TAGS, purgePublicPages } from "@/public-cache";

import {
  evidenceField,
  evidenceLinkUrls,
  rows,
  tidyEvidenceRows,
} from "./evidence-field";
import { refuse } from "./refuse";
import { fillSlug, slugField } from "./slug";

const CHANGE_NOTE_MAX_LENGTH = 500;

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
  "evidence",
  "references",
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

/**
 * Blocks, before anything is written, the operations that would take a
 * published topic offline or replace it without a change log entry:
 * - Unpublishing (one topic or in bulk). A published topic is archived instead.
 * - An update that neither publishes nor says "draft". Payload writes the
 *   live version for any update without `draft`, which would skip the change
 *   note, the change log, and the public page purge; it becomes a draft save.
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
      "topics",
      req,
      "_status",
      "Status",
      "Topics are not unpublished. To take one out of lists, tick Archived, add a change note, and publish.",
    );
  }
  if (
    (operation === "update" || operation === "updateByID") &&
    !draft &&
    status !== "published"
  ) {
    return { ...args, draft: true };
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
        "topics",
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
      "topics",
      req,
      "changeNote",
      "Change note",
      "Say what changed and why. The note is shown in the topic's public change log.",
    );
  }
  if (publishing && !richTextHasText(data.body ?? stored?.body)) {
    refuse("topics", req, "body", "Body", "Write the topic before publishing.");
  }

  const kind = topicChangeKind(save);
  // Archiving only takes a topic out of lists, so it is never blocked by a
  // reference that was edited since the topic was published.
  if (publishing && kind !== "archived") {
    const errors = await evidenceErrors(req, {
      people: data.people ?? stored?.people,
      body: data.body ?? stored?.body,
      evidence: data.evidence ?? stored?.evidence,
      references: data.references ?? stored?.references,
    });
    if (errors.length > 0) {
      throw new ValidationError({ collection: "topics", errors, req });
    }
  }

  const state = topicStateAfterSave(save);
  if (state) data.state = state;
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

/**
 * The snippets a topic's evidence uses, with their videos' checks, and
 * whether any names a speaker: quoting a person names them (ADR 0007).
 */
async function snippetEvidence(
  req: PayloadRequest,
  evidence: unknown,
): Promise<{ snippets: SnippetEvidence[]; quotesSomeone: boolean }> {
  const snippetIds = [
    ...new Set(
      rows(evidence).flatMap((row) => {
        const id = row.kind === "snippet" ? relationId(row.snippet) : null;
        return id ? [id] : [];
      }),
    ),
  ];
  if (snippetIds.length === 0) return { snippets: [], quotesSomeone: false };
  const { docs: snippets } = await req.payload.find({
    collection: "snippets",
    where: { id: { in: snippetIds } },
    select: { caption: true, endS: true, video: true, speaker: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const videoIds = snippets.flatMap((snippet) => {
    const id = relationId(snippet.video);
    return id ? [id] : [];
  });
  const { docs: videos } =
    videoIds.length > 0
      ? await req.payload.find({
          collection: "videos",
          where: { id: { in: videoIds } },
          select: { checkStatus: true, confirmedAt: true, durationS: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const videosById = new Map(videos.map((video) => [String(video.id), video]));
  const snippetsById = new Map(
    snippets.map((snippet) => [String(snippet.id), snippet]),
  );
  return {
    snippets: snippetIds.map((id) => {
      const snippet = snippetsById.get(id);
      const video = videosById.get(relationId(snippet?.video) ?? "");
      return {
        caption: snippet?.caption ?? "Unknown snippet",
        end_s: snippet?.endS ?? 0,
        video: video
          ? {
              checkStatus: video.checkStatus,
              confirmed: Boolean(video.confirmedAt),
              duration_s: video.durationS ?? null,
            }
          : null,
      };
    }),
    quotesSomeone: snippets.some((snippet) => relationId(snippet.speaker)),
  };
}

/**
 * Why the topic's evidence does not allow publishing: it names individuals
 * without evidence or a reference, or cites references that are not confirmed.
 */
async function evidenceErrors(
  req: PayloadRequest,
  topic: Record<string, unknown>,
) {
  const citedIds = [
    ...new Set(
      rows(topic.references).flatMap((row) => {
        const id = relationId(row.reference);
        return id ? [id] : [];
      }),
    ),
  ];
  const { docs } =
    citedIds.length > 0
      ? await req.payload.find({
          collection: "references",
          where: { id: { in: citedIds } },
          select: { title: true, checkStatus: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const cited = new Map(docs.map((doc) => [String(doc.id), doc]));
  const { snippets, quotesSomeone } = await snippetEvidence(
    req,
    topic.evidence,
  );
  return evidenceProblems({
    namesIndividuals:
      rows(topic.people).length > 0 ||
      richTextLinksTo(topic.body, "individuals") ||
      quotesSomeone,
    evidenceCount: rows(topic.evidence).length,
    references: citedIds.map((id) => ({
      title: cited.get(id)?.title ?? "Unknown reference",
      checkStatus: cited.get(id)?.checkStatus ?? null,
    })),
    snippets,
  }).map(({ field, message }) => ({
    path: field,
    label: field === "evidence" ? "Evidence" : "References",
    message,
  }));
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
  if (field === "evidence")
    return rows(value).map((row) => ({
      kind: row.kind ?? null,
      title: row.title ?? null,
      file: relationId(row.file),
      snippet: relationId(row.snippet),
      url: row.url ?? null,
      archiveUrl: row.archiveUrl ?? null,
      note: row.note ?? null,
    }));
  if (field === "references")
    return rows(value).map((row) => ({
      reference: relationId(row.reference),
      stance: row.stance ?? null,
      passage: row.passage ?? null,
      locator: row.locator ?? null,
    }));
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
    // Every publish has a change log entry, so this is where the live
    // version changes; draft saves leave visitors' pages alone.
    purgePublicPages([PUBLIC_TAGS.topics]);
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

/**
 * Keeps the individuals linked in the body as a relationship, so a public
 * page can ask which topics name a person without reading every body.
 */
const recordBodyLinks: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const linked = richTextLinkedIds(
    data.body ?? originalDoc?.body,
    "individuals",
  );
  // Only individuals that still exist: before body links were recorded, an
  // individual linked only in a body could be deleted, and the relationship
  // refuses ids it cannot find.
  const { docs } =
    linked.length > 0
      ? await req.payload.find({
          collection: "individuals",
          where: { id: { in: linked } },
          select: { slug: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      : { docs: [] };
  const existing = new Set(docs.map((doc) => String(doc.id)));
  data.linkedIndividuals = linked.filter((id) => existing.has(id));
  return data;
};

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
          maxLength: 2000,
          admin: {
            description:
              "The words in the reference that support, contradict, or explain the topic, quoted exactly.",
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
