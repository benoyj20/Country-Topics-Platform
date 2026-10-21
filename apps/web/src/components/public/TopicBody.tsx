import {
  type JSXConvertersFunction,
  RichText,
} from "@payloadcms/richtext-lexical/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { internalLinkTarget, isAllowedLinkUrl } from "@/editor";
import type { TopicPage } from "@/public/types";

import styles from "./public.module.css";

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
 * A topic's body. Links to topics and individuals become links to their
 * pages when those are public, and plain text otherwise (a draft topic, say).
 */
export function TopicBody({
  body,
  links,
}: {
  body: TopicPage["body"];
  links: TopicPage["bodyLinks"];
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
      const href = target
        ? links[`${target.relationTo}:${target.id}`]
        : undefined;
      return href ? <Link href={href}>{children}</Link> : <>{children}</>;
    },
    autolink: ({ node, nodesToJSX }) =>
      externalLink(node.fields, nodesToJSX({ nodes: node.children })),
  });
  return (
    <RichText className={styles.body} data={body} converters={converters} />
  );
}
