import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnderlineFeature,
  UnorderedListFeature,
} from "@payloadcms/richtext-lexical";
import type { TextFieldSingleValidation } from "payload";

/** External links in rich text: web pages and email only. */
export function isAllowedLinkUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return ["https:", "http:", "mailto:"].includes(protocol);
  } catch {
    return false;
  }
}

const validateLinkUrl: TextFieldSingleValidation = (value, { siblingData }) => {
  const linkType =
    siblingData && typeof siblingData === "object" && "linkType" in siblingData
      ? siblingData.linkType
      : undefined;
  if (linkType === "internal") return true;
  return typeof value === "string" && isAllowedLinkUrl(value)
    ? true
    : "Enter a full link starting with https://, http://, or mailto:.";
};

// The editor for topic bodies and any later rich text. Only the features the
// site renders are enabled: no uploads (evidence is listed beside the text,
// with its licence and archive), no embedded relationships, and links limited
// to web pages, email, topics, and individuals. The default link check accepts `javascript:` URLs, so the URL
// field gets a stricter one.
export const editor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ["h2", "h3", "h4"] }),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    StrikethroughFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    LinkFeature({
      enabledCollections: ["topics", "individuals"],
      fields: ({ defaultFields }) =>
        defaultFields.map((field) =>
          "name" in field && field.name === "url" && field.type === "text"
            ? // The url field is a single-value text field; TypeScript cannot
              // narrow the TextField union (hasMany) from `type` alone.
              ({ ...field, validate: validateLinkUrl } as typeof field)
            : field,
        ),
    }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
});

type LexicalNode = {
  type?: unknown;
  text?: unknown;
  children?: unknown;
  fields?: unknown;
};

/** Whether a Lexical document contains any non-blank text. */
export function richTextHasText(value: unknown): boolean {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root;
  const visit = (node: LexicalNode): boolean => {
    if (typeof node.text === "string" && node.text.trim()) return true;
    return Array.isArray(node.children)
      ? node.children.some((child: LexicalNode) => visit(child))
      : false;
  };
  return root ? visit(root) : false;
}

/** The document an internal link points to, as stored or populated. */
export type InternalLinkTarget = { relationTo: string; id: string };

/** The target of a link node's fields, when it is an internal link. */
export function internalLinkTarget(fields: unknown): InternalLinkTarget | null {
  if (
    !fields ||
    typeof fields !== "object" ||
    !("linkType" in fields) ||
    fields.linkType !== "internal" ||
    !("doc" in fields) ||
    !fields.doc ||
    typeof fields.doc !== "object" ||
    !("relationTo" in fields.doc) ||
    typeof fields.doc.relationTo !== "string" ||
    !("value" in fields.doc)
  ) {
    return null;
  }
  const value = fields.doc.value;
  const id =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? String(value.id)
        : null;
  return id ? { relationTo: fields.doc.relationTo, id } : null;
}

/** Every document a Lexical document links to, each once, in reading order. */
export function richTextLinkTargets(value: unknown): InternalLinkTarget[] {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root;
  const found = new Map<string, InternalLinkTarget>();
  const visit = (node: LexicalNode) => {
    const target = internalLinkTarget(node.fields);
    if (target) found.set(`${target.relationTo}:${target.id}`, target);
    if (Array.isArray(node.children)) {
      for (const child of node.children as LexicalNode[]) visit(child);
    }
  };
  if (root) visit(root);
  return [...found.values()];
}

/** The ids of the documents of one collection that a Lexical document links to. */
export function richTextLinkedIds(
  value: unknown,
  collection: string,
): string[] {
  return richTextLinkTargets(value)
    .filter((target) => target.relationTo === collection)
    .map((target) => target.id);
}

/**
 * Whether a Lexical document links to any document of a collection, such as
 * an individual: a topic that links a person names them. A link whose
 * document is missing still counts, since its text still names someone.
 */
export function richTextLinksTo(value: unknown, collection: string): boolean {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root;
  const visit = (node: LexicalNode): boolean => {
    const fields = node.fields;
    if (
      fields &&
      typeof fields === "object" &&
      "linkType" in fields &&
      fields.linkType === "internal" &&
      "doc" in fields &&
      fields.doc &&
      typeof fields.doc === "object" &&
      "relationTo" in fields.doc &&
      fields.doc.relationTo === collection
    ) {
      return true;
    }
    return Array.isArray(node.children)
      ? node.children.some((child: LexicalNode) => visit(child))
      : false;
  };
  return root ? visit(root) : false;
}
