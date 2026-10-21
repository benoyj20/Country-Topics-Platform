import {
  type JSXConvertersFunction,
  RichText,
} from "@payloadcms/richtext-lexical/react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// A copy of apps/web's TopicBody, with its two link helpers inlined, to see
// whether Payload's rich-text renderer runs in the Workers runtime.

type LinkFields = { url?: unknown; newTab?: unknown };

function isAllowedLinkUrl(value: string): boolean {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function internalLinkTarget(
  fields: unknown,
): { relationTo: string; id: string } | null {
  if (!fields || typeof fields !== "object" || !("doc" in fields)) return null;
  const doc = fields.doc;
  if (
    !doc ||
    typeof doc !== "object" ||
    !("relationTo" in doc) ||
    !("value" in doc)
  ) {
    return null;
  }
  const { relationTo, value } = doc;
  return typeof relationTo === "string" && typeof value === "string"
    ? { relationTo, id: value }
    : null;
}

function externalLink(fields: LinkFields, children: ReactNode): ReactNode {
  const url = typeof fields.url === "string" ? fields.url : "";
  if (!isAllowedLinkUrl(url)) return <>{children}</>;
  return fields.newTab ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <a href={url} rel="noreferrer">
      {children}
    </a>
  );
}

export function TopicBody({
  body,
  links,
}: {
  body: ComponentProps<typeof RichText>["data"];
  links: Record<string, string>;
}) {
  const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
    ...defaultConverters,
    paragraph: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children });
      return children.length > 0 ? <p>{children}</p> : null;
    },
    link: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children });
      if (node.fields.linkType !== "internal") {
        return externalLink(node.fields, children);
      }
      const target = internalLinkTarget(node.fields);
      const href = target
        ? links[`${target.relationTo}:${target.id}`]
        : undefined;
      return href ? <Link href={href}>{children}</Link> : <>{children}</>;
    },
    autolink: ({ node, nodesToJSX }) =>
      externalLink(node.fields, nodesToJSX({ nodes: node.children })),
  });
  return <RichText className="body" data={body} converters={converters} />;
}
