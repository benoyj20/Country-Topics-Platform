import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { addClassNamesToElement, isHTMLAnchorElement } from "@lexical/utils";
import {
  $applyNodeReplacement,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  type BaseSelection,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from "lexical";

// The topic body's nodes, saving the JSON Payload's editor saves (apps/web's
// src/editor.ts), so the site renders an edit from the admin exactly as one
// from Payload's panel (ADR 0014, "The admin"). Payload's editor uses
// Lexical's own heading, quote, and list nodes; its link, autolink, and
// horizontal rule are its own classes, mirrored here from
// @payloadcms/richtext-lexical 3.90.2, because importing them would bring
// Payload's admin UI into the browser. tests/body-json.test.ts checks both
// against Payload's whenever either is upgraded (Lexical stays at the
// version Payload uses).

/** A link's fields, as Payload's link drawer saves them. */
export type LinkFields = {
  linkType?: "custom" | "internal";
  url?: string;
  newTab?: boolean;
  doc?: { relationTo: string; value: unknown } | null;
  [field: string]: unknown;
};

export type SerializedLinkNode = SerializedElementNode & {
  fields: LinkFields;
  id?: string;
};

const SUPPORTED_URL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "sms:",
  "tel:",
]);

/** A new link's id: 24 hex digits, the shape of Payload's ObjectIDs. */
function newLinkId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Payload's v1 links held the whole linked document; later ones its id. */
function withDocId(serialized: SerializedLinkNode): LinkFields {
  const doc = serialized.fields?.doc;
  if (
    serialized.version === 1 &&
    doc?.value &&
    typeof doc.value === "object" &&
    "id" in doc.value &&
    doc.value.id
  ) {
    return { ...serialized.fields, doc: { ...doc, value: doc.value.id } };
  }
  return serialized.fields;
}

/** A link pasted from a web page or document, as Payload's editor reads it. */
function $convertAnchorElement(element: HTMLElement): DOMConversionOutput {
  if (!isHTMLAnchorElement(element) || !element.textContent) {
    return { node: null };
  }
  return {
    node: $createLinkNode({
      fields: {
        doc: null,
        linkType: "custom",
        newTab: element.getAttribute("target") === "_blank",
        url: element.getAttribute("href") ?? "",
      },
    }),
  };
}

function sanitizeUrl(url: string): string {
  try {
    return SUPPORTED_URL_PROTOCOLS.has(new URL(url).protocol)
      ? url
      : "about:blank";
  } catch {
    return "https://";
  }
}

export class LinkNode extends ElementNode {
  __fields: LinkFields;
  __id: string | undefined;

  constructor(
    {
      id,
      fields = { linkType: "custom", newTab: false },
    }: { id?: string; fields?: LinkFields } = {},
    key?: NodeKey,
  ) {
    super(key);
    this.__fields = fields;
    this.__id = id;
  }

  static getType(): string {
    return "link";
  }

  static clone(node: LinkNode): LinkNode {
    return new LinkNode({ id: node.__id, fields: node.__fields }, node.__key);
  }

  static importDOM(): DOMConversionMap | null {
    return { a: () => ({ conversion: $convertAnchorElement, priority: 1 }) };
  }

  static importJSON(serialized: SerializedLinkNode): LinkNode {
    return $createLinkNode({}).updateFromJSON({
      ...serialized,
      fields: withDocId(serialized),
    });
  }

  updateFromJSON(serialized: SerializedLinkNode): this {
    return super
      .updateFromJSON(serialized)
      .setFields(serialized.fields)
      .setID(serialized.id);
  }

  exportJSON(): SerializedLinkNode {
    const fields = { ...this.getFields() };
    if (fields.linkType === "internal") delete fields.url;
    else if (fields.linkType === "custom") delete fields.doc;
    const serialized: SerializedLinkNode = {
      ...super.exportJSON(),
      type: "link",
      fields,
      version: 3,
    };
    const id = this.getID();
    if (id) serialized.id = id;
    return serialized;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("a");
    if (this.__fields.linkType === "custom") {
      element.href = sanitizeUrl(this.__fields.url ?? "");
    }
    if (this.__fields.newTab) element.target = "_blank";
    addClassNamesToElement(element, config.theme.link);
    return element;
  }

  updateDOM(previous: LinkNode): boolean {
    // Recreate the element when a field it shows changes.
    return (
      previous.__fields.url !== this.__fields.url ||
      previous.__fields.newTab !== this.__fields.newTab ||
      previous.__fields.linkType !== this.__fields.linkType
    );
  }

  getFields(): LinkFields {
    return this.getLatest().__fields;
  }

  setFields(fields: LinkFields): this {
    const writable = this.getWritable();
    writable.__fields = fields;
    return writable;
  }

  getID(): string | undefined {
    return this.getLatest().__id;
  }

  setID(id: string | undefined): this {
    const writable = this.getWritable();
    writable.__id = id;
    return writable;
  }

  insertNewAfter(
    selection: RangeSelection,
    restoreSelection = true,
  ): ElementNode | null {
    const element = this.getParentOrThrow().insertNewAfter(
      selection,
      restoreSelection,
    );
    if ($isElementNode(element)) {
      const link = $createLinkNode({ fields: this.__fields });
      element.append(link);
      return link;
    }
    return null;
  }

  canBeEmpty(): false {
    return false;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  extractWithChild(_child: LexicalNode, selection: BaseSelection): boolean {
    if (!$isRangeSelection(selection)) return false;
    return (
      this.isParentOf(selection.anchor.getNode()) &&
      this.isParentOf(selection.focus.getNode()) &&
      selection.getTextContent().length > 0
    );
  }
}

export function $createLinkNode({
  id,
  fields,
}: {
  id?: string;
  fields?: LinkFields;
}): LinkNode {
  return $applyNodeReplacement(new LinkNode({ id: id ?? newLinkId(), fields }));
}

export function $isLinkNode(
  node: LexicalNode | null | undefined,
): node is LinkNode {
  return node instanceof LinkNode;
}

/**
 * A link Payload's editor made from a typed URL. The new admin keeps
 * existing ones but makes none.
 */
export class AutoLinkNode extends LinkNode {
  static getType(): string {
    return "autolink";
  }

  static clone(node: AutoLinkNode): AutoLinkNode {
    return new AutoLinkNode({ id: "", fields: node.__fields }, node.__key);
  }

  static importDOM(): null {
    // Pasted links are links, as in Payload's editor.
    return null;
  }

  static importJSON(serialized: SerializedLinkNode): AutoLinkNode {
    return $applyNodeReplacement(new AutoLinkNode({ id: "" })).updateFromJSON({
      ...serialized,
      fields: withDocId(serialized),
    });
  }

  exportJSON(): SerializedLinkNode {
    // As Payload's: no id, and only these keys.
    const serialized = super.exportJSON();
    return {
      type: "autolink",
      children: serialized.children,
      direction: serialized.direction,
      fields: serialized.fields,
      format: serialized.format,
      indent: serialized.indent,
      version: 2,
    };
  }

  insertNewAfter(
    selection: RangeSelection,
    restoreSelection = true,
  ): ElementNode | null {
    const element = this.getParentOrThrow().insertNewAfter(
      selection,
      restoreSelection,
    );
    if ($isElementNode(element)) {
      const link = $applyNodeReplacement(
        new AutoLinkNode({ id: "", fields: this.__fields }),
      );
      element.append(link);
      return link;
    }
    return null;
  }
}

export class HorizontalRuleNode extends DecoratorNode<null> {
  static getType(): string {
    return "horizontalrule";
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: () => ({ node: $createHorizontalRuleNode() }),
        priority: 0,
      }),
    };
  }

  static importJSON(): HorizontalRuleNode {
    return $createHorizontalRuleNode();
  }

  exportJSON(): SerializedLexicalNode {
    return { type: "horizontalrule", version: 1 };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("hr");
    addClassNamesToElement(element, config.theme.hr);
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): false {
    return false;
  }

  decorate(): null {
    return null;
  }
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return $applyNodeReplacement(new HorizontalRuleNode());
}

/** Every node a topic body can hold, for the editor's config. */
export const BODY_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
];

/** The link the selection is in, when it is in one. */
export function $selectedLink(): LinkNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  for (const node of [selection.anchor.getNode(), selection.focus.getNode()]) {
    const link = $isLinkNode(node) ? node : node.getParent();
    if ($isLinkNode(link)) return link;
  }
  return null;
}

/**
 * Links the selected text with `fields`, changing any link it is already
 * in; with nothing selected, changes the link the cursor is in. Text in
 * different paragraphs gets a link each, as in Payload's editor, and text
 * after an existing link joins that link, so the order is kept.
 */
export function $linkSelection(fields: LinkFields): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  if (selection.isCollapsed()) {
    $selectedLink()?.setFields(fields);
    return;
  }
  let link: LinkNode | null = null;
  let linkParent: ElementNode | null = null;
  for (const node of selection.extract()) {
    if (!$isTextNode(node) && !$isLineBreakNode(node)) continue;
    const parent = node.getParent();
    if ($isLinkNode(parent)) {
      parent.setFields(fields);
      link = parent;
      linkParent = parent.getParent();
      continue;
    }
    // By key: a node edited in this update is a new object.
    if (!link || !parent?.is(linkParent)) {
      link = $createLinkNode({ fields });
      node.insertBefore(link);
      linkParent = parent;
    }
    link.append(node);
  }
}

/** Removes the links around the selected text, keeping the text. */
export function $unlinkSelection(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const links = new Map<NodeKey, LinkNode>();
  for (const node of selection.getNodes()) {
    const link = $isLinkNode(node) ? node : node.getParent();
    if ($isLinkNode(link)) links.set(link.getKey(), link);
  }
  for (const link of links.values()) {
    for (const child of link.getChildren()) link.insertBefore(child);
    link.remove();
  }
}
