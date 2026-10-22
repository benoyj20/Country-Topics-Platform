import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminPickerSearchParams,
  EMPTY_TOPIC,
  editorTopic,
  payloadRefusal,
  storedTopicSchema,
  topicFieldOf,
  topicFieldsSearchParams,
  topicSaveBody,
  topicSaveSearchParams,
  type TopicValues,
  topicVersionsSearchParams,
  valuesAfterSave,
} from "../src/index.ts";

const TOPIC = "01a1600f-6eef-7e31-b9cf-6fc65af69851";
const GHANA = "01a1600f-6eef-7e31-b9cf-6fc65af69852";
const PERSON = "01a1600f-6eef-7e31-b9cf-6fc65af69853";
const REFERENCE = "01a1600f-6eef-7e31-b9cf-6fc65af69854";
const FILE = "01a1600f-6eef-7e31-b9cf-6fc65af69855";
const NOW = "2026-10-22T10:00:00.000Z";

describe("a refusal's paths", () => {
  it("name the form's fields, rows' fields, and the body", () => {
    assert.equal(topicFieldOf("title"), "title");
    assert.equal(topicFieldOf("changeNote"), "changeNote");
    assert.equal(topicFieldOf("body"), "body");
    assert.equal(topicFieldOf("body.root.children.0.fields.url"), "body");
    assert.equal(topicFieldOf("people"), "people");
    assert.equal(topicFieldOf("people.0"), "people");
    assert.equal(topicFieldOf("people.0.individual"), "people.0.individual");
    assert.equal(topicFieldOf("evidence.12.url"), "evidence.12.url");
    assert.equal(topicFieldOf("references.1.passage"), "references.1.passage");
  });

  it("leave everything else above the form", () => {
    for (const path of [
      "_status",
      "linkedIndividuals",
      "evidence.0.archiveStatus",
      "evidence.x.url",
      "references.0.passage.extra",
      "state",
    ]) {
      assert.equal(topicFieldOf(path), null, path);
    }
  });
});

describe("a refused write", () => {
  it("puts Payload's field messages beside their fields", () => {
    const refusal = payloadRefusal(
      400,
      {
        errors: [
          {
            name: "ValidationError",
            message:
              "The following fields are invalid: Title, Evidence 1 > Link",
            data: {
              collection: "topics",
              errors: [
                {
                  path: "title",
                  label: "Title",
                  message: "This field is required.",
                },
                {
                  path: "evidence.0.url",
                  label: "Link",
                  message: "Enter the page's link.",
                },
                {
                  path: "_status",
                  label: "Status",
                  message: "Topics are not unpublished.",
                },
              ],
            },
          },
        ],
      },
      topicFieldOf,
    );
    assert.deepEqual(refusal.fields, {
      title: ["This field is required."],
      "evidence.0.url": ["Enter the page's link."],
    });
    assert.deepEqual(refusal.general, ["Status: Topics are not unpublished."]);
  });

  it("lists a refusal without fields, and the frontend's own errors", () => {
    assert.deepEqual(
      payloadRefusal(
        403,
        {
          errors: [{ message: "You are not allowed to perform this action." }],
        },
        topicFieldOf,
      ).general,
      ["You are not allowed to perform this action."],
    );
    assert.deepEqual(
      payloadRefusal(
        502,
        { error: "The backend did not answer.", problems: [] },
        topicFieldOf,
      ).general,
      ["The backend did not answer."],
    );
    assert.deepEqual(payloadRefusal(500, "<html>", topicFieldOf).general, [
      "The backend refused the save (500).",
    ]);
  });
});

const values: TopicValues = {
  ...EMPTY_TOPIC,
  title: "TEST topic",
  summary: "TEST summary.",
  body: { root: { type: "root", children: [] } },
  countries: [{ id: GHANA, title: "Ghana" }],
  people: [
    {
      id: "6ad59d0b291f7aed58138d75",
      individual: { id: PERSON, title: "TEST Person" },
      role: "speaker",
    },
  ],
  evidence: [
    {
      kind: "image",
      title: "TEST photo",
      file: {
        id: FILE,
        title: "TEST.png",
        mimeType: "image/png",
        url: "/files/TEST.png",
      },
      snippet: null,
      url: "",
      archiveUrl: " ",
      note: "",
    },
  ],
  references: [
    {
      reference: {
        id: REFERENCE,
        title: "TEST reference",
        checkStatus: "resolved",
      },
      stance: "context",
      passage: "TEST passage.",
      locator: "",
    },
  ],
  changeNote: "  ",
  slug: "",
};

describe("a save's body", () => {
  it("sends related records by id, and no value for empty optional text", () => {
    const body = topicSaveBody(values, true);
    assert.deepEqual(body.countries, [GHANA]);
    assert.equal(body.category, null);
    assert.deepEqual(body.people, [
      { id: "6ad59d0b291f7aed58138d75", individual: PERSON, role: "speaker" },
    ]);
    assert.deepEqual(body.evidence, [
      {
        kind: "image",
        title: "TEST photo",
        file: FILE,
        snippet: null,
        url: null,
        archiveUrl: null,
        note: null,
      },
    ]);
    assert.deepEqual(body.references, [
      {
        reference: REFERENCE,
        stance: "context",
        passage: "TEST passage.",
        locator: null,
      },
    ]);
    assert.equal(body.changeNote, null);
    assert.equal(body._status, "published");
  });

  it("asks for an empty slug to be filled, except on a new topic", () => {
    assert.equal(topicSaveBody(values, false).slug, "");
    assert.equal(topicSaveBody(values, false)._status, "draft");
    assert.equal(
      "slug" in topicSaveBody(values, false, { creating: true }),
      false,
    );
    assert.equal(
      topicSaveBody({ ...values, slug: " test-topic " }, false, {
        creating: true,
      }).slug,
      "test-topic",
    );
  });

  it("saves a draft with draft=true, and publishes without it", () => {
    assert.equal(topicSaveSearchParams(false).get("draft"), "true");
    assert.equal(topicSaveSearchParams(true).has("draft"), false);
    assert.equal(topicSaveSearchParams(true).get("depth"), "0");
  });
});

describe("a stored topic", () => {
  const stored = storedTopicSchema.parse({
    id: TOPIC,
    title: "TEST topic",
    countries: [
      { id: GHANA, name: "Ghana" },
      "01a1600f-6eef-7e31-b9cf-6fc65af69899",
    ],
    category: { id: "01a1600f-6eef-7e31-b9cf-6fc65af69898", name: "" },
    people: [{ id: "row-1", individual: PERSON, role: "subject" }],
    evidence: [
      {
        id: "row-2",
        kind: "image",
        title: null,
        file: {
          id: FILE,
          filename: "TEST.png",
          mimeType: "image/png",
          url: "/files/TEST.png",
        },
        snippet: null,
        url: null,
        archiveUrl: null,
        note: null,
      },
    ],
    references: [
      {
        id: "row-3",
        reference: {
          id: REFERENCE,
          title: "TEST reference",
          checkStatus: "pending",
        },
        stance: "supports",
        passage: "TEST passage.",
        locator: null,
      },
    ],
    changeNote: null,
    state: "published",
    _status: "draft",
    firstPublishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });

  it("becomes the form's values, with what each related record shows", () => {
    const { values: shown, status } = editorTopic(stored, null);
    assert.deepEqual(shown.countries, [
      { id: GHANA, title: "Ghana" },
      // Not populated: removed, or hidden from this reader.
      { id: "01a1600f-6eef-7e31-b9cf-6fc65af69899", title: null },
    ]);
    // Populated without a name: untitled, not hidden.
    assert.deepEqual(shown.category, {
      id: "01a1600f-6eef-7e31-b9cf-6fc65af69898",
      title: "",
    });
    assert.deepEqual(shown.people, [
      { id: "row-1", individual: { id: PERSON, title: null }, role: "subject" },
    ]);
    assert.deepEqual(shown.evidence[0]?.file, {
      id: FILE,
      title: "TEST.png",
      mimeType: "image/png",
      url: "/files/TEST.png",
    });
    assert.equal(shown.evidence[0]?.title, "");
    assert.equal(shown.references[0]?.reference?.checkStatus, "pending");
    assert.equal(shown.changeNote, "");
    assert.equal(status.latest, "draft");
    assert.equal(status.state, "published");
  });

  it("keeps the titles the form showed after a depth-0 save", () => {
    const saved = storedTopicSchema.parse({
      id: TOPIC,
      title: "TEST topic",
      countries: [GHANA],
      people: [{ id: "row-9", individual: PERSON, role: "speaker" }],
      evidence: [
        {
          id: "row-8",
          kind: "image",
          title: "TEST photo",
          file: FILE,
          snippet: null,
          url: null,
          archiveUrl: null,
          note: null,
        },
      ],
      references: [
        {
          id: "row-7",
          reference: REFERENCE,
          stance: "context",
          passage: "TEST passage.",
          locator: null,
        },
      ],
      slug: "test-topic",
      changeNote: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const after = valuesAfterSave(saved, values);
    assert.deepEqual(after.countries, [{ id: GHANA, title: "Ghana" }]);
    assert.deepEqual(after.people, [
      {
        id: "row-9",
        individual: { id: PERSON, title: "TEST Person" },
        role: "speaker",
      },
    ]);
    assert.equal(after.evidence[0]?.file?.mimeType, "image/png");
    assert.equal(after.references[0]?.reference?.checkStatus, "resolved");
    assert.equal(after.slug, "test-topic");
    assert.equal(after.changeNote, "");
    assert.equal(after.body, values.body);
  });
});

describe("the editor's reads", () => {
  it("read the newest version with related records by what the form shows", () => {
    const params = topicFieldsSearchParams();
    assert.equal(params.get("draft"), "true");
    assert.equal(params.get("depth"), "1");
    assert.equal(params.get("select[evidence]"), "true");
    assert.equal(params.has("select[body]"), false);
    assert.equal(params.get("populate[references][checkStatus]"), "true");
    assert.equal(params.get("populate[media][mimeType]"), "true");
  });

  it("page a topic's versions newest first", () => {
    const params = topicVersionsSearchParams(TOPIC, 2);
    assert.equal(params.get("where[parent][equals]"), TOPIC);
    assert.equal(params.get("sort"), "-updatedAt");
    assert.equal(params.get("page"), "2");
  });

  it("let a picker search within what a field allows", () => {
    const params = adminPickerSearchParams("media", "TEST", {
      extra: ["mimeType"],
      where: { mimeType: { in: ["application/pdf"] } },
    });
    assert.equal(
      params.get("where[and][0][mimeType][in][0]"),
      "application/pdf",
    );
    assert.ok(
      [...params.keys()].some((key) => key.startsWith("where[and][1][or]")),
    );
    assert.equal(params.get("select[mimeType]"), "true");
    assert.equal(params.get("limit"), "10");
    const topics = adminPickerSearchParams("topics", "");
    assert.equal(topics.get("draft"), "true");
    assert.equal(
      [...topics.keys()].some((key) => key.startsWith("where")),
      false,
    );
  });
});
