import {
  CLAIM_STANCES,
  type ClaimStance,
  EVIDENCE_KINDS,
  type EvidenceKind,
  isSlug,
  REFERENCE_CHECK_STATUSES,
  type ReferenceCheckStatus,
  richTextPlainText,
  SLUG_MESSAGE,
  slugify,
  TOPIC_CHANGE_KINDS,
  TOPIC_PERSON_ROLES,
  TOPIC_STATES,
  type TopicPersonRole,
  type TopicState,
} from "@countrytopics/domain";
import * as z from "zod";

import {
  adminPageSchema,
  recordOf,
  Related,
  type RelatedRecord,
  type RelatedValue,
} from "./admin-lists.ts";

// The admin's topic editor (ADR 0014, phase 8), through Payload's REST API:
// how a topic is read for editing, the body a save sends, and which of the
// form's fields a refusal names. The backend's tests send these requests
// and check every refusal its hooks give lands on a field shown here.

/** A file, with what its evidence row shows of it. */
export type RelatedFile = RelatedRecord & {
  mimeType: string | null;
  url: string | null;
};

/** A cited reference, with whether it can be published yet. */
export type RelatedReference = RelatedRecord & {
  checkStatus: ReferenceCheckStatus | null;
};

/** A row of an array field; `id` is Payload's, absent until first saved. */
type Row = { id?: string };

export type TopicPersonRow = Row & {
  individual: RelatedRecord | null;
  role: TopicPersonRole;
};

export type TopicEvidenceRow = Row & {
  kind: EvidenceKind;
  title: string;
  file: RelatedFile | null;
  snippet: RelatedRecord | null;
  url: string;
  archiveUrl: string;
  note: string;
};

export type TopicCitationRow = Row & {
  reference: RelatedReference | null;
  stance: ClaimStance;
  passage: string;
  locator: string;
};

/** What the editor's form holds. */
export type TopicValues = {
  title: string;
  summary: string;
  /** A Lexical document, as Payload's editor saves it, or none yet. */
  body: unknown;
  countries: RelatedRecord[];
  category: RelatedRecord | null;
  tags: RelatedRecord[];
  people: TopicPersonRow[];
  evidence: TopicEvidenceRow[];
  references: TopicCitationRow[];
  changeNote: string;
  readyForReview: boolean;
  archived: boolean;
  slug: string;
};

/** Set by the backend only, and shown beside the form. */
export type TopicStatus = {
  /** The latest version: a draft, or the published one. */
  latest: "draft" | "published";
  state: TopicState;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  lastEditedBy: RelatedRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type EditorTopic = {
  id: string;
  values: TopicValues;
  status: TopicStatus;
};

export const EMPTY_TOPIC: TopicValues = {
  title: "",
  summary: "",
  body: null,
  countries: [],
  category: null,
  tags: [],
  people: [],
  evidence: [],
  references: [],
  changeNote: "",
  readyForReview: false,
  archived: false,
  slug: "",
};

export function emptyPersonRow(): TopicPersonRow {
  return { individual: null, role: "subject" };
}

export function emptyEvidenceRow(): TopicEvidenceRow {
  return {
    kind: "document",
    title: "",
    file: null,
    snippet: null,
    url: "",
    archiveUrl: "",
    note: "",
  };
}

export function emptyCitationRow(): TopicCitationRow {
  return { reference: null, stance: "supports", passage: "", locator: "" };
}

// What a related record shows, by collection, as populated for the editor.
const RELATED_FIELDS = {
  countries: ["name"],
  categories: ["name"],
  tags: ["name"],
  individuals: ["name"],
  media: ["alt", "filename", "mimeType", "url"],
  snippets: ["caption"],
  references: ["title", "checkStatus"],
  users: ["email"],
} as const;

/** The fields the editor reads, besides the body. */
const EDITED_FIELDS = [
  "title",
  "summary",
  "countries",
  "category",
  "tags",
  "people",
  "evidence",
  "references",
  "changeNote",
  "readyForReview",
  "archived",
  "slug",
  "state",
  "_status",
  "firstPublishedAt",
  "lastPublishedAt",
  "lastEditedBy",
  "createdAt",
  "updatedAt",
] as const;

/**
 * The query string of `GET /api/topics/<id>` for the editor's fields: the
 * newest version, a draft or not, with related records by what the form
 * shows of them. The body is read on its own, at depth 0 (topicBodySearchParams),
 * so its links keep only their documents' ids, as Payload's editor saves them.
 */
export function topicFieldsSearchParams(): URLSearchParams {
  const params = new URLSearchParams({ depth: "1", draft: "true" });
  for (const field of EDITED_FIELDS) params.set(`select[${field}]`, "true");
  for (const [collection, fields] of Object.entries(RELATED_FIELDS)) {
    for (const field of fields) {
      params.set(`populate[${collection}][${field}]`, "true");
    }
  }
  return params;
}

/** The query string of `GET /api/topics/<id>` for the body, as stored. */
export function topicBodySearchParams(): URLSearchParams {
  return new URLSearchParams({
    depth: "0",
    draft: "true",
    "select[body]": "true",
    "select[updatedAt]": "true",
  });
}

const text = z.string().nullish();
/** A file, by its description or else its name. */
export function fileOf(value: RelatedValue): RelatedFile {
  if (typeof value === "string") {
    return { id: value, title: null, mimeType: null, url: null };
  }
  const field = (name: string) => {
    const shown = value[name];
    return typeof shown === "string" && shown ? shown : null;
  };
  return {
    id: value.id,
    title: field("alt") ?? field("filename") ?? "",
    mimeType: field("mimeType"),
    url: field("url"),
  };
}

const CheckStatus = z.enum(REFERENCE_CHECK_STATUSES);

/** A reference, with its check. */
export function referenceOf(value: RelatedValue): RelatedReference {
  const status = CheckStatus.safeParse(
    typeof value === "string" ? undefined : value.checkStatus,
  );
  return {
    ...recordOf("references", value),
    checkStatus: status.success ? status.data : null,
  };
}

/** A topic as `GET /api/topics/<id>` sends it, at depth 0 or with related records populated. */
export const storedTopicSchema = z.looseObject({
  id: z.string(),
  title: text,
  summary: text,
  countries: z.array(Related).nullish(),
  category: Related.nullish(),
  tags: z.array(Related).nullish(),
  people: z
    .array(
      z.looseObject({
        id: text,
        individual: Related.nullish(),
        role: z.enum(TOPIC_PERSON_ROLES).nullish(),
      }),
    )
    .nullish(),
  evidence: z
    .array(
      z.looseObject({
        id: text,
        kind: z.enum(EVIDENCE_KINDS).nullish(),
        title: text,
        file: Related.nullish(),
        snippet: Related.nullish(),
        url: text,
        archiveUrl: text,
        note: text,
      }),
    )
    .nullish(),
  references: z
    .array(
      z.looseObject({
        id: text,
        reference: Related.nullish(),
        stance: z.enum(CLAIM_STANCES).nullish(),
        passage: text,
        locator: text,
      }),
    )
    .nullish(),
  readyForReview: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  slug: text,
  state: z.enum(TOPIC_STATES).nullish(),
  _status: z.enum(["draft", "published"]).nullish(),
  firstPublishedAt: text,
  lastPublishedAt: text,
  lastEditedBy: Related.nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoredTopic = z.infer<typeof storedTopicSchema>;

/** The body as `GET /api/topics/<id>` sends it with topicBodySearchParams. */
export const storedBodySchema = z.looseObject({
  id: z.string(),
  body: z.unknown(),
  updatedAt: z.string(),
});

const rowId = (id: string | null | undefined) => (id ? { id } : {});

/** The form's values and the backend's status of a stored topic and its body. */
export function editorTopic(stored: StoredTopic, body: unknown): EditorTopic {
  return {
    id: stored.id,
    values: {
      title: stored.title ?? "",
      summary: stored.summary ?? "",
      body: body ?? null,
      countries: (stored.countries ?? []).map((value) =>
        recordOf("countries", value),
      ),
      category: stored.category
        ? recordOf("categories", stored.category)
        : null,
      tags: (stored.tags ?? []).map((value) => recordOf("tags", value)),
      people: (stored.people ?? []).map((row) => ({
        ...rowId(row.id),
        individual: row.individual
          ? recordOf("individuals", row.individual)
          : null,
        role: row.role ?? "subject",
      })),
      evidence: (stored.evidence ?? []).map((row) => ({
        ...rowId(row.id),
        kind: row.kind ?? "document",
        title: row.title ?? "",
        file: row.file ? fileOf(row.file) : null,
        snippet: row.snippet ? recordOf("snippets", row.snippet) : null,
        url: row.url ?? "",
        archiveUrl: row.archiveUrl ?? "",
        note: row.note ?? "",
      })),
      references: (stored.references ?? []).map((row) => ({
        ...rowId(row.id),
        reference: row.reference ? referenceOf(row.reference) : null,
        stance: row.stance ?? "supports",
        passage: row.passage ?? "",
        locator: row.locator ?? "",
      })),
      // Never stored: it becomes the publish's change log entry.
      changeNote: "",
      readyForReview: stored.readyForReview ?? false,
      archived: stored.archived ?? false,
      slug: stored.slug ?? "",
    },
    status: {
      latest: stored._status === "published" ? "published" : "draft",
      state: stored.state ?? "draft",
      firstPublishedAt: stored.firstPublishedAt ?? null,
      lastPublishedAt: stored.lastPublishedAt ?? null,
      lastEditedBy: stored.lastEditedBy
        ? recordOf("users", stored.lastEditedBy)
        : null,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  };
}

/** Empty optional text is saved as no value, as Payload stores a field never filled. */
const optional = (value: string) => (value.trim() ? value : null);

/**
 * The JSON body of a save: `POST /api/topics` for a new topic, `PATCH
 * /api/topics/<id>` for one that exists, with `draft=true` in the query
 * unless it publishes (topicSaveSearchParams). Related records go by id.
 */
export function topicSaveBody(
  values: TopicValues,
  publish: boolean,
  { creating = false }: { creating?: boolean } = {},
): Record<string, unknown> {
  return {
    title: values.title,
    summary: values.summary,
    body: values.body,
    countries: values.countries.map(({ id }) => id),
    category: values.category?.id ?? null,
    tags: values.tags.map(({ id }) => id),
    people: values.people.map((row) => ({
      ...rowId(row.id),
      individual: row.individual?.id ?? null,
      role: row.role,
    })),
    evidence: values.evidence.map((row) => ({
      ...rowId(row.id),
      kind: row.kind,
      title: optional(row.title),
      file: row.file?.id ?? null,
      snippet: row.snippet?.id ?? null,
      url: optional(row.url),
      archiveUrl: optional(row.archiveUrl),
      note: optional(row.note),
    })),
    references: values.references.map((row) => ({
      ...rowId(row.id),
      reference: row.reference?.id ?? null,
      stance: row.stance,
      passage: row.passage,
      locator: optional(row.locator),
    })),
    changeNote: optional(values.changeNote),
    readyForReview: values.readyForReview,
    archived: values.archived,
    // An empty slug is filled from the title. A new topic leaves it out,
    // so one without a title yet stores none rather than an empty one.
    ...(creating && !values.slug.trim() ? {} : { slug: values.slug.trim() }),
    _status: publish ? "published" : "draft",
  };
}

/** The query string of a save; the answer holds the topic at depth 0. */
export function topicSaveSearchParams(publish: boolean): URLSearchParams {
  const params = new URLSearchParams({ depth: "0" });
  if (!publish) params.set("draft", "true");
  return params;
}

/** The answer to a save that was not refused. */
export const savedTopicSchema = z.looseObject({ doc: storedTopicSchema });

/**
 * The form's values after a save: what the backend stored (row ids, the
 * filled slug, tidied evidence, no change note), with the titles the form
 * already showed, which a depth-0 answer leaves out. The body stays as
 * the editor has it.
 */
export function valuesAfterSave(
  saved: StoredTopic,
  shown: TopicValues,
): TopicValues {
  const after = editorTopic(saved, shown.body).values;
  const byId = <T extends RelatedRecord>(records: (T | null)[]) =>
    new Map(records.flatMap((record) => (record ? [[record.id, record]] : [])));
  const records = byId([
    ...shown.countries,
    shown.category,
    ...shown.tags,
    ...shown.people.map((row) => row.individual),
    ...shown.evidence.map((row) => row.snippet),
  ]);
  const files = byId(shown.evidence.map((row) => row.file));
  const references = byId(shown.references.map((row) => row.reference));
  const shownAs = <T extends RelatedRecord>(
    known: Map<string, T>,
    record: T | null,
  ): T | null => (record ? (known.get(record.id) ?? record) : null);
  const all = (list: RelatedRecord[]) =>
    list.map((record) => records.get(record.id) ?? record);
  return {
    ...after,
    countries: all(after.countries),
    category: shownAs(records, after.category),
    tags: all(after.tags),
    people: after.people.map((row) => ({
      ...row,
      individual: shownAs(records, row.individual),
    })),
    evidence: after.evidence.map((row) => ({
      ...row,
      file: shownAs(files, row.file),
      snippet: shownAs(records, row.snippet),
    })),
    references: after.references.map((row) => ({
      ...row,
      reference: shownAs(references, row.reference),
    })),
  };
}

const TOP_LEVEL_FIELDS = new Set([
  "title",
  "summary",
  "body",
  "countries",
  "category",
  "tags",
  "people",
  "evidence",
  "references",
  "changeNote",
  "readyForReview",
  "archived",
  "slug",
]);

const ROW_FIELDS: Record<string, ReadonlySet<string>> = {
  people: new Set(["individual", "role"]),
  evidence: new Set([
    "kind",
    "title",
    "file",
    "snippet",
    "url",
    "archiveUrl",
    "note",
  ]),
  references: new Set(["reference", "stance", "passage", "locator"]),
};

/**
 * The form's field for a path a refusal names: a field, such as `title`;
 * a row's field, such as `evidence.0.url`; or the body, for any path in
 * it. Null for anything else, such as `_status`, shown above the form.
 */
export function topicFieldOf(path: string): string | null {
  if (TOP_LEVEL_FIELDS.has(path)) return path;
  if (path.startsWith("body.")) return "body";
  const [array, index, field, ...rest] = path.split(".");
  if (
    array &&
    ROW_FIELDS[array] &&
    index !== undefined &&
    /^\d+$/.test(index) &&
    rest.length === 0
  ) {
    if (field === undefined) return array;
    if (ROW_FIELDS[array].has(field)) return `${array}.${index}.${field}`;
  }
  return null;
}

/** Payload's message for a required field left empty. */
export const REQUIRED_MESSAGE = "This field is required.";

/**
 * What a publish needs filled in, checked in the browser before sending, as
 * Payload's panel checks its fields: the backend's publish hook would
 * otherwise refuse a topic without a body before naming the other fields
 * it lacks. The messages are the backend's; the backend still checks all
 * of these, and the rest.
 */
export function topicPublishChecks(
  values: TopicValues,
): Record<string, string[]> {
  const problems: Record<string, string[]> = {};
  const need = (key: string, message = REQUIRED_MESSAGE) => {
    (problems[key] ??= []).push(message);
  };
  if (!values.title.trim()) need("title");
  if (!values.summary.trim()) need("summary");
  if (!richTextPlainText(values.body)) {
    need("body", "Write the topic before publishing.");
  }
  if (values.countries.length === 0) need("countries");
  // An empty slug is filled from the title, when the title gives one.
  const slug = values.slug.trim();
  if (slug ? !isSlug(slug) : !slugify(values.title)) need("slug", SLUG_MESSAGE);
  values.people.forEach((row, index) => {
    if (!row.individual) need(`people.${index}.individual`);
  });
  values.evidence.forEach((row, index) => {
    const at = `evidence.${index}`;
    if (!row.title.trim() && row.kind !== "snippet") {
      need(`${at}.title`, "Give the evidence a title.");
    }
    if ((row.kind === "document" || row.kind === "image") && !row.file) {
      need(`${at}.file`);
    }
    if (row.kind === "snippet" && !row.snippet) need(`${at}.snippet`);
    if (row.kind === "link" && !row.url.trim()) {
      need(`${at}.url`, "Enter the page's link.");
    }
  });
  values.references.forEach((row, index) => {
    if (!row.reference) need(`references.${index}.reference`);
    if (!row.passage.trim()) need(`references.${index}.passage`);
  });
  return problems;
}

/** How many versions a page of a topic's history lists. */
export const TOPIC_VERSIONS_PER_PAGE = 20;

/** The query string of `GET /api/topics/versions` for a page of a topic's history. */
export function topicVersionsSearchParams(
  topic: string,
  page: number,
): URLSearchParams {
  return new URLSearchParams({
    "where[parent][equals]": topic,
    sort: "-updatedAt",
    depth: "0",
    limit: String(TOPIC_VERSIONS_PER_PAGE),
    page: String(page),
    "select[createdAt]": "true",
    "select[updatedAt]": "true",
    "select[latest]": "true",
    "select[version][title]": "true",
    "select[version][_status]": "true",
    "select[version][archived]": "true",
  });
}

export const topicVersionRowSchema = z.looseObject({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latest: z.boolean().nullish(),
  version: z.looseObject({
    title: text,
    _status: z.enum(["draft", "published"]).nullish(),
    archived: z.boolean().nullish(),
  }),
});
export type TopicVersionRow = z.infer<typeof topicVersionRowSchema>;
export const topicVersionsPageSchema = adminPageSchema(topicVersionRowSchema);

/** The query string of `GET /api/topics/versions/<id>`, for one version shown whole. */
export function topicVersionSearchParams(): URLSearchParams {
  const params = new URLSearchParams({ depth: "1" });
  for (const [collection, fields] of Object.entries(RELATED_FIELDS)) {
    for (const field of fields) {
      params.set(`populate[${collection}][${field}]`, "true");
    }
  }
  return params;
}

export const topicVersionSchema = z.looseObject({
  id: z.string(),
  parent: Related,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: storedTopicSchema
    .omit({ id: true })
    .extend({ body: z.unknown(), createdAt: text, updatedAt: text }),
});

/** A restore of `version` saves it as the topic's newest draft. */
export function topicRestoreSearchParams(): URLSearchParams {
  return new URLSearchParams({ depth: "0", draft: "true" });
}

/** How many change log entries the editor lists. */
export const TOPIC_CHANGES_SHOWN = 50;

/**
 * The query string of `GET /api/topic-changes` for a topic's change log,
 * newest first; with `versions`, only the entries for those versions.
 */
export function topicChangesSearchParams(
  topic: string,
  versions?: readonly string[],
): URLSearchParams {
  const params = new URLSearchParams({
    "where[and][0][topic][equals]": topic,
    sort: "-createdAt",
    depth: "1",
    limit: String(
      versions ? Math.max(versions.length, 1) : TOPIC_CHANGES_SHOWN,
    ),
    "select[kind]": "true",
    "select[note]": "true",
    "select[version]": "true",
    "select[actor]": "true",
    "select[createdAt]": "true",
    "populate[users][email]": "true",
  });
  versions?.forEach((version, index) =>
    params.set(`where[and][1][version][in][${index}]`, version),
  );
  return params;
}

/** The query string of `GET /api/topic-changes/<id>`, for one entry with its topic's title. */
export function topicChangeSearchParams(): URLSearchParams {
  return new URLSearchParams({
    depth: "1",
    "populate[topics][title]": "true",
    "populate[users][email]": "true",
  });
}

export const topicChangeSchema = z.looseObject({
  id: z.string(),
  /** Left out of a topic's change log, which is read by topic. */
  topic: Related.nullish(),
  kind: z.enum(TOPIC_CHANGE_KINDS),
  note: z.string(),
  version: text,
  actor: Related.nullish(),
  createdAt: z.string(),
});
export const topicChangesPageSchema = adminPageSchema(topicChangeSchema);
