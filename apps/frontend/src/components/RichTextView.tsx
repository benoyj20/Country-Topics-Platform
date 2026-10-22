import type { RichTextBody } from "@countrytopics/contracts";
import {
  type InternalLinkTarget,
  internalLinkTarget,
  isAllowedLinkUrl,
} from "@countrytopics/domain";
import {
  type JSXConvertersFunction,
  RichText,
} from "@payloadcms/richtext-lexical/react";
import Link from "next/link";
import type { ReactNode } from "react";

// A rich-text body as the site shows it, without the site's styles, so
// both the topic page and the admin's version view render it the same way.

type LinkFields = { url?: unknown; newTab?: unknown };

/** A link off the site; anything but http(s) or mailto stays plain text. */
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

/**
 * A body. A link to a topic or an individual goes where `hrefOf` says,
 * or is plain text when it says nowhere (a draft topic on the site, say).
 */
export function RichTextView({
  body,
  hrefOf,
  className,
}: {
  body: RichTextBody;
  hrefOf: (target: InternalLinkTarget) => string | undefined;
  className?: string;
}) {
  const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
    ...defaultConverters,
    // Paragraphs are spaced by the page, so blank ones that editors leave
    // between them would only double the gap.
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
      const href = target ? hrefOf(target) : undefined;
      return href ? <Link href={href}>{children}</Link> : <>{children}</>;
    },
    autolink: ({ node, nodesToJSX }) =>
      externalLink(node.fields, nodesToJSX({ nodes: node.children })),
  });
  return <RichText className={className} data={body} converters={converters} />;
}
