import type { TopicPage } from "@countrytopics/contracts";

import { RichTextView } from "@/shared/RichTextView";

import styles from "./public.module.css";

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
  return (
    <RichTextView
      className={styles.body}
      body={body}
      hrefOf={(target) => links[`${target.relationTo}:${target.id}`]}
    />
  );
}
