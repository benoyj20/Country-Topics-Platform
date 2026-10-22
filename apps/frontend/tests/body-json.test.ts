import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { $generateNodesFromDOM } from "@lexical/html";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import * as payloadEditor from "@payloadcms/richtext-lexical";
import { Window } from "happy-dom";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $insertNodes,
  $setSelection,
  createEditor,
  type ElementNode,
  type Klass,
  type LexicalNode,
  type SerializedEditorState,
  type TextNode,
} from "lexical";

import * as ours from "../src/admin/editor/body-nodes.ts";

// The admin's body editor must save what Payload's editor saves (ADR 0014,
// phases 2 and 8: "the saved JSON renders unchanged on the site"). Payload's
// own nodes are the reference, taken from the features apps/api's editor
// enables; this test is the one place the frontend loads Payload's editor
// package, in Node only. BODIES_FILE, a JSON array of bodies (such as every
// topic version in a local database), adds them to the documents checked.

type Nodes = ReadonlyArray<Klass<LexicalNode>>;

/** The nodes Payload's editor registers for apps/api's features. */
async function payloadNodes(): Promise<Nodes> {
  const features = [
    payloadEditor.HeadingFeature({ enabledHeadingSizes: ["h2", "h3", "h4"] }),
    payloadEditor.BlockquoteFeature(),
    payloadEditor.UnorderedListFeature(),
    payloadEditor.OrderedListFeature(),
    payloadEditor.HorizontalRuleFeature(),
    // Without apps/api's options, which shape the link form, not its nodes,
    // and would need the collections' config.
    payloadEditor.LinkFeature(),
  ];
  const nodes: Klass<LexicalNode>[] = [];
  for (const provider of features) {
    const feature: { nodes?: { node: Klass<LexicalNode> }[] } =
      typeof provider.feature === "function"
        ? // Only these features' node lists are read, which need no config.
          await provider.feature({
            config: { collections: [] },
            isRoot: true,
            openEditors: [],
            parentIsLocalized: false,
            featureProviderMap: new Map(),
            resolvedFeatures: new Map(),
            unSanitizedEditorConfig: {},
          } as never)
        : provider.feature;
    for (const { node } of feature.nodes ?? []) {
      if (!nodes.includes(node)) nodes.push(node);
    }
  }
  return nodes;
}

const PAYLOAD_NODES = await payloadNodes();

function payloadNode(type: string): Klass<LexicalNode> {
  const node = PAYLOAD_NODES.find((klass) => klass.getType() === type);
  assert.ok(node, `Payload has a ${type} node`);
  return node;
}

/** The three nodes that differ, as each editor creates them. */
type Creators = {
  link(fields: ours.LinkFields, id: string): ElementNode;
  autolink(fields: ours.LinkFields): ElementNode;
  rule(): LexicalNode;
};

const PAYLOAD_CREATORS: Creators = {
  link: (fields, id) => payloadEditor.$createLinkNode({ id, fields } as never),
  autolink: (fields) => payloadEditor.$createAutoLinkNode({ fields } as never),
  rule: () => new (payloadNode("horizontalrule") as new () => LexicalNode)(),
};

const OUR_CREATORS: Creators = {
  link: (fields, id) => ours.$createLinkNode({ id, fields }),
  autolink: (fields) => new ours.AutoLinkNode({ id: "", fields }),
  rule: () => ours.$createHorizontalRuleNode(),
};

const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const UNDERLINE = 8;

function text(value: string, format = 0): TextNode {
  return $createTextNode(value).setFormat(format);
}

/** A body with every node and format apps/api's editor allows. */
function $buildEveryFeature(create: Creators): void {
  const root = $getRoot();
  root.append($createHeadingNode("h2").append(text("A TEST heading")));
  root.append(
    $createParagraphNode().append(
      text("Plain, "),
      text("bold", BOLD),
      text(", "),
      text("italic", ITALIC),
      text(", "),
      text("underlined", UNDERLINE),
      text(", "),
      text("struck", STRIKETHROUGH),
      text(" and "),
      text("all four", BOLD | ITALIC | UNDERLINE | STRIKETHROUGH),
      text("."),
    ),
  );
  root.append(
    $createParagraphNode().append(
      text("See "),
      create
        .link(
          { linkType: "custom", newTab: false, url: "https://example.test/a" },
          "0123456789abcdef01234567",
        )
        .append(text("a page")),
      text(", "),
      create
        .link(
          { linkType: "custom", newTab: true, url: "mailto:test@example.test" },
          "76543210fedcba9876543210",
        )
        .append(text("an address", BOLD)),
      text(", "),
      create
        .link(
          {
            linkType: "internal",
            newTab: false,
            url: "",
            doc: {
              relationTo: "topics",
              value: "01a1600f-6eef-7e31-b9cf-6fc65af69851",
            },
          },
          "aaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .append(text("a topic")),
      text(", "),
      create
        .link(
          {
            linkType: "internal",
            newTab: false,
            doc: {
              relationTo: "individuals",
              value: "01a1600f-6eef-7e31-b9cf-6fc65af69852",
            },
          },
          "bbbbbbbbbbbbbbbbbbbbbbbb",
        )
        .append(text("a person")),
      text(" and "),
      create
        .autolink({
          linkType: "custom",
          newTab: false,
          url: "https://example.test/typed",
        })
        .append(text("https://example.test/typed")),
      text("."),
    ),
  );
  root.append($createHeadingNode("h3").append(text("Lists")));
  const nested = $createListNode("bullet").append(
    $createListItemNode().append(text("A nested TEST item")),
  );
  root.append(
    $createListNode("bullet").append(
      $createListItemNode().append(text("One")),
      $createListItemNode().append(nested),
      $createListItemNode().append(text("Two", ITALIC)),
    ),
  );
  root.append(
    $createListNode("number", 3).append(
      $createListItemNode().append(text("Third")),
      $createListItemNode().append(text("Fourth")),
    ),
  );
  root.append($createHeadingNode("h4").append(text("A quote")));
  root.append($createQuoteNode().append(text("A TEST quotation.")));
  root.append(create.rule());
  // Empty paragraphs are kept; the site drops them when rendering.
  root.append($createParagraphNode());
  root.append($createParagraphNode().append(text("The end.")));
}

function built(nodes: Nodes, build: () => void): SerializedEditorState {
  const editor = createHeadlessEditor({
    nodes,
    onError: (error) => {
      throw error;
    },
  });
  editor.update(build, { discrete: true });
  return editor.getEditorState().toJSON();
}

/** A document read into an editor with `nodes` and written out again. */
function roundTrip(
  nodes: Nodes,
  document: SerializedEditorState,
): SerializedEditorState {
  const editor = createHeadlessEditor({
    nodes,
    onError: (error) => {
      throw error;
    },
  });
  editor.setEditorState(editor.parseEditorState(document));
  return editor.getEditorState().toJSON();
}

/** What is saved: the editor's JSON as text, so undefined keys drop out. */
function saved(document: SerializedEditorState): unknown {
  return JSON.parse(JSON.stringify(document));
}

// Lexical's reconciler uses these browser globals.
const window = new Window();
for (const name of [
  "document",
  "navigator",
  "MutationObserver",
  "Node",
  "Element",
  "HTMLElement",
  "Text",
  "DocumentFragment",
] as const) {
  Object.defineProperty(globalThis, name, {
    value: window[name],
    configurable: true,
  });
}
Object.assign(globalThis, {
  window,
  getSelection: () => window.getSelection(),
  getComputedStyle: (element: never) => window.getComputedStyle(element),
});

/**
 * A document opened in an editor attached to a page, so Lexical's
 * reconciler, which runs only with a DOM, has had its turn, then written
 * out: what the admin sends when a body is saved without edits.
 */
async function mounted(
  nodes: Nodes,
  document: SerializedEditorState,
): Promise<SerializedEditorState> {
  const editor = createEditor({
    nodes,
    onError: (error) => {
      throw error;
    },
  });
  const element = window.document.createElement("div");
  element.contentEditable = "true";
  window.document.body.append(element);
  editor.setRootElement(element as unknown as HTMLElement);
  editor.setEditorState(editor.parseEditorState(document));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(element.children.length > 0, "the editor rendered the body");
  const json = editor.getEditorState().toJSON();
  editor.setRootElement(null);
  element.remove();
  return json;
}

const EVERY_FEATURE = built(PAYLOAD_NODES, () =>
  $buildEveryFeature(PAYLOAD_CREATORS),
);

function fixtureBody(): SerializedEditorState {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/test-topic.json", import.meta.url),
      "utf8",
    ),
  ) as { body: SerializedEditorState };
  return fixture.body;
}

/** Bodies Payload's editor wrote, so it writes them back unchanged. */
const REFERENCES: [string, SerializedEditorState][] = [
  ["every feature, made by Payload's nodes", EVERY_FEATURE],
  ["the TEST fixture", fixtureBody()],
];

/**
 * Every body to check, adding BODIES_FILE's. Stored bodies can differ from
 * what Payload's editor writes today, such as paragraphs saved before
 * Lexical added their textStyle, which either editor adds on the next save.
 */
function documents(): [string, SerializedEditorState][] {
  const file = process.env.BODIES_FILE;
  if (!file) return REFERENCES;
  const bodies = JSON.parse(
    readFileSync(file, "utf8"),
  ) as SerializedEditorState[];
  return [
    ...REFERENCES,
    ...bodies.map((body, i): [string, SerializedEditorState] => [
      `${file} #${i}`,
      body,
    ]),
  ];
}

test("the reference bodies are what Payload's editor writes", () => {
  for (const [name, document] of REFERENCES) {
    assert.deepEqual(
      saved(roundTrip(PAYLOAD_NODES, document)),
      saved(document),
      name,
    );
  }
});

test("the admin's editor writes back what Payload's would", () => {
  for (const [name, document] of documents()) {
    assert.deepEqual(
      saved(roundTrip(ours.BODY_NODES, document)),
      saved(roundTrip(PAYLOAD_NODES, document)),
      name,
    );
  }
});

test("the same after the editor shows a body on a page", async () => {
  for (const [name, document] of documents()) {
    assert.deepEqual(
      saved(await mounted(ours.BODY_NODES, document)),
      saved(roundTrip(PAYLOAD_NODES, document)),
      name,
    );
  }
});

test("content made in the admin's editor is what Payload's would make", () => {
  assert.deepEqual(
    saved(built(ours.BODY_NODES, () => $buildEveryFeature(OUR_CREATORS))),
    saved(EVERY_FEATURE),
  );
});

test("the Link button makes Payload's link", () => {
  const url = "https://example.test/report";
  const linked = built(ours.BODY_NODES, () => {
    const words = text("Read the TEST report here.");
    $getRoot().append($createParagraphNode().append(words));
    const selection = $createRangeSelection();
    selection.anchor.set(words.getKey(), "Read ".length, "text");
    selection.focus.set(words.getKey(), "Read the TEST report".length, "text");
    $setSelection(selection);
    ours.$linkSelection({ linkType: "custom", newTab: false, url });
  });
  const [paragraph] = linked.root.children as unknown as {
    children: { id?: string }[];
  }[];
  const id = paragraph?.children[1]?.id ?? "";
  assert.match(id, /^[0-9a-f]{24}$/);

  const expected = built(PAYLOAD_NODES, () => {
    $getRoot().append(
      $createParagraphNode().append(
        text("Read "),
        PAYLOAD_CREATORS.link(
          { linkType: "custom", newTab: false, url },
          id,
        ).append(text("the TEST report")),
        text(" here."),
      ),
    );
  });
  assert.deepEqual(saved(linked), saved(expected));
});

/** Selects from `start` in the first text node to `end` in the last. */
function $selectText(
  first: TextNode,
  start: number,
  last: TextNode,
  end: number,
) {
  const selection = $createRangeSelection();
  selection.anchor.set(first.getKey(), start, "text");
  selection.focus.set(last.getKey(), end, "text");
  $setSelection(selection);
}

type SavedNode = {
  type: string;
  text?: string;
  id?: string;
  fields?: ours.LinkFields;
  children?: SavedNode[];
};

/** Each text in a saved body, in order, with the link it is in, if any. */
function texts(document: SerializedEditorState): [string, string | null][] {
  const found: [string, string | null][] = [];
  const walk = (node: SavedNode, url: string | null) => {
    if (node.type === "text") found.push([node.text ?? "", url]);
    const inner = node.type === "link" ? (node.fields?.url ?? null) : url;
    for (const child of node.children ?? []) walk(child, inner);
  };
  walk(document.root as unknown as SavedNode, null);
  return found;
}

test("linking across an existing link keeps the text in order", () => {
  const url = "https://example.test/new";
  const relinked = built(ours.BODY_NODES, () => {
    const before = text("Before ");
    const after = text(" after.");
    const inLink = text("linked");
    $getRoot().append(
      $createParagraphNode().append(
        before,
        ours
          .$createLinkNode({
            fields: {
              linkType: "custom",
              newTab: false,
              url: "https://example.test/old",
            },
          })
          .append(inLink),
        after,
      ),
    );
    $selectText(before, 0, after, " after.".length);
    ours.$linkSelection({ linkType: "custom", newTab: false, url });
  });
  const found = texts(relinked);
  assert.equal(found.map(([words]) => words).join(""), "Before linked after.");
  assert.ok(found.every(([, linkUrl]) => linkUrl === url));
});

test("Unlink gives back the plain text", () => {
  const sentence = "Read the TEST report here.";
  const unlinked = built(ours.BODY_NODES, () => {
    const words = text(sentence);
    $getRoot().append($createParagraphNode().append(words));
    $selectText(words, "Read ".length, words, "Read the TEST report".length);
    ours.$linkSelection({
      linkType: "custom",
      newTab: false,
      url: "https://example.test/report",
    });
    const [first, , last] = $getRoot().getAllTextNodes();
    $selectText(first!, 0, last!, last!.getTextContentSize());
    ours.$unlinkSelection();
  });
  const plain = built(PAYLOAD_NODES, () => {
    $getRoot().append($createParagraphNode().append(text(sentence)));
  });
  assert.deepEqual(saved(unlinked), saved(plain));
});

/** A body pasted as HTML, with each link's random id replaced by its order. */
function pasted(nodes: Nodes, html: string): unknown {
  const editor = createHeadlessEditor({
    nodes,
    onError: (error) => {
      throw error;
    },
  });
  const dom = new window.DOMParser().parseFromString(html, "text/html");
  editor.update(
    () => {
      $getRoot().select();
      $insertNodes($generateNodesFromDOM(editor, dom as unknown as Document));
    },
    { discrete: true },
  );
  let count = 0;
  return JSON.parse(
    JSON.stringify(editor.getEditorState().toJSON()),
    (key, value: unknown) => {
      if (key !== "id" || typeof value !== "string") return value;
      assert.match(value, /^[0-9a-f]{24}$/);
      return `link-${count++}`;
    },
  );
}

test("pasted HTML becomes what Payload's editor makes of it", () => {
  const html =
    '<h2>A TEST heading</h2><p>See <a href="https://example.test/a" target="_blank">a page</a>' +
    ' and <a href="mailto:test@example.test"><b>an address</b></a>.</p><hr>' +
    "<ul><li>One</li><li>Two</li></ul><blockquote>A TEST quotation.</blockquote>";
  const ourPaste = pasted(ours.BODY_NODES, html);
  assert.deepEqual(ourPaste, pasted(PAYLOAD_NODES, html));
  assert.match(JSON.stringify(ourPaste), /"type":"horizontalrule"/);
  assert.equal(
    (JSON.stringify(ourPaste).match(/"type":"link"/g) ?? []).length,
    2,
  );
});

test("a link to a topic is Payload's internal link", () => {
  const fields: ours.LinkFields = {
    linkType: "internal",
    newTab: true,
    doc: {
      relationTo: "topics",
      value: "01a1600f-6eef-7e31-b9cf-6fc65af69851",
    },
  };
  const linked = built(ours.BODY_NODES, () => {
    const words = text("See the TEST topic.");
    $getRoot().append($createParagraphNode().append(words));
    $selectText(words, "See ".length, words, "See the TEST topic".length);
    ours.$linkSelection(fields);
  });
  const [paragraph] = linked.root.children as unknown as {
    children: { id?: string }[];
  }[];
  const id = paragraph?.children[1]?.id ?? "";
  const expected = built(PAYLOAD_NODES, () => {
    $getRoot().append(
      $createParagraphNode().append(
        text("See "),
        PAYLOAD_CREATORS.link(fields, id).append(text("the TEST topic")),
        text("."),
      ),
    );
  });
  assert.deepEqual(saved(linked), saved(expected));
});

test("with the cursor in a link, linking changes that link", () => {
  const changed = built(ours.BODY_NODES, () => {
    const inLink = text("a TEST page");
    const link = ours
      .$createLinkNode({
        id: "0123456789abcdef01234567",
        fields: {
          linkType: "custom",
          newTab: false,
          url: "https://example.test/old",
        },
      })
      .append(inLink);
    $getRoot().append($createParagraphNode().append(text("See "), link));
    $selectText(inLink, 2, inLink, 2);
    ours.$linkSelection({
      linkType: "custom",
      newTab: true,
      url: "https://example.test/new",
    });
  });
  const expected = built(PAYLOAD_NODES, () => {
    $getRoot().append(
      $createParagraphNode().append(
        text("See "),
        PAYLOAD_CREATORS.link(
          { linkType: "custom", newTab: true, url: "https://example.test/new" },
          "0123456789abcdef01234567",
        ).append(text("a TEST page")),
      ),
    );
  });
  assert.deepEqual(saved(changed), saved(expected));
});
