import Link from "next/link";

import { formatDate } from "@/public/format";
import type { LimitedList, TopicSummary } from "@/public/types";

import styles from "./public.module.css";

/** Published topics, newest first, each with its countries and summary. */
export function TopicList({
  topics,
  empty,
}: {
  topics: LimitedList<TopicSummary>;
  /** Shown when there are none, such as "No topics about Kenya yet." */
  empty: string;
}) {
  if (topics.items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <>
      <ul className={styles.topics}>
        {topics.items.map((topic) => (
          <li key={topic.slug} className={styles.topicCard}>
            <h3>
              <Link href={`/topics/${topic.slug}`}>{topic.title}</Link>
            </h3>
            <p>{topic.summary}</p>
            <p className={styles.meta}>
              {topic.countries.map((country, index) => (
                <span key={country.slug}>
                  {index > 0 ? ", " : null}
                  <Link href={`/countries/${country.slug}`}>
                    {country.name}
                  </Link>
                </span>
              ))}
              {topic.firstPublishedAt
                ? `${topic.countries.length > 0 ? " · " : ""}${formatDate(topic.firstPublishedAt)}`
                : null}
            </p>
          </li>
        ))}
      </ul>
      {topics.more ? (
        <p className="muted">
          Showing the {topics.items.length} newest topics. Browsing older ones
          comes with search and filters.
        </p>
      ) : null}
    </>
  );
}
