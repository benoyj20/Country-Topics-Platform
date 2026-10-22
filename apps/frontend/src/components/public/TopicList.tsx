import type { LimitedList, TopicSummary } from "@countrytopics/contracts";
import Link from "next/link";

import { counted, formatDate } from "@/format";

import styles from "./public.module.css";

/** Published topics as cards, each with its countries and summary. */
export function TopicList({
  topics,
  empty,
  moreHref,
  layout = "list",
}: {
  /** Browse results also say how many references and comments each has. */
  topics: LimitedList<
    TopicSummary & { referenceCount?: number; commentCount?: number }
  >;
  /** Shown when there are none, such as "No topics about Kenya yet." */
  empty: string;
  /** Where to browse them all, when the list stops short. */
  moreHref?: string;
  /** Cards in a grid, or one under another. */
  layout?: "grid" | "list";
}) {
  if (topics.items.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <>
      <ul className={layout === "grid" ? styles.topicGrid : styles.topics}>
        {topics.items.map((topic) => (
          <li key={topic.slug} className={styles.topicCard}>
            {topic.countries.length > 0 ? (
              <p className={styles.cardCountries}>
                {topic.countries.map((country) => (
                  <Link key={country.slug} href={`/countries/${country.slug}`}>
                    {country.name}
                  </Link>
                ))}
              </p>
            ) : null}
            <h3>
              <Link href={`/topics/${topic.slug}`}>{topic.title}</Link>
            </h3>
            <p className={styles.summary}>{topic.summary}</p>
            <p className={styles.cardMeta}>
              {topic.firstPublishedAt ? (
                <time dateTime={topic.firstPublishedAt}>
                  {formatDate(topic.firstPublishedAt)}
                </time>
              ) : null}
              {topic.referenceCount !== undefined ? (
                <span>{counted(topic.referenceCount, "reference")}</span>
              ) : null}
              {topic.commentCount ? (
                <span>{counted(topic.commentCount, "comment")}</span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {topics.more ? (
        <p className="muted">
          Showing the {topics.items.length} newest topics.{" "}
          {moreHref ? <Link href={moreHref}>Browse all of them</Link> : null}
        </p>
      ) : null}
    </>
  );
}
