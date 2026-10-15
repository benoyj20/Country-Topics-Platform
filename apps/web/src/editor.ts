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
  if ((siblingData as { linkType?: string }).linkType === "internal")
    return true;
  return typeof value === "string" && isAllowedLinkUrl(value)
    ? true
    : "Enter a full link starting with https://, http://, or mailto:.";
};

// The editor for topic bodies and any later rich text. Only the features the
// site renders are enabled: no uploads (evidence comes in week 5), no embedded
// relationships, and links limited to web pages, email, topics, and
// individuals. The default link check accepts `javascript:` URLs, so the URL
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
            ? ({ ...field, validate: validateLinkUrl } as typeof field)
            : field,
        ),
    }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
});

type LexicalNode = { type?: unknown; text?: unknown; children?: unknown };

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
