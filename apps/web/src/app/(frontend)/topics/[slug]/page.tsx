import { isSlug, type TopicPersonRole } from "@countrytopics/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentSection } from "@/components/comments/CommentSection";
import { EvidenceList } from "@/components/public/EvidenceList";
import styles from "@/components/public/public.module.css";
import { ReferenceList } from "@/components/public/ReferenceList";
import { TopicBody } from "@/components/public/TopicBody";
import { PERSON_ROLE_LABELS, TOPIC_CHANGE_LABELS } from "@/content-labels";
import { topicPage } from "@/public/cached";
import { formatDate } from "@/public/format";
import type { IndividualLink, TopicPage } from "@/public/types";

// Rendered on a page's first visit, then cached for everyone and purged when
// content changes (ADR 0007); equal to PUBLIC_REVALIDATE_S.
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]): Promise<TopicPage> {
  const { slug } = await params;
  const topic = isSlug(slug) ? await topicPage(slug) : null;
  if (!topic) notFound();
  return topic;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await load(params);
  return {
    title: `${topic.title} - Country Topics`,
    description: topic.summary,
  };
}

/** The people a topic names, grouped by their part in it. */
function peopleByRole(people: TopicPage["people"]) {
  const groups = new Map<TopicPersonRole, IndividualLink[]>();
  for (const { individual, role } of people) {
    groups.set(role, [...(groups.get(role) ?? []), individual]);
  }
  return [...groups];
}

export default async function TopicPageView({ params }: Props) {
  const topic = await load(params);
  const updated =
    topic.lastPublishedAt && topic.lastPublishedAt !== topic.firstPublishedAt
      ? topic.lastPublishedAt
      : null;
  const contents = [
    { id: "topic-text", label: "Overview", shown: true },
    { id: "evidence", label: "Evidence", shown: topic.evidence.length > 0 },
    {
      id: "references",
      label: "References",
      shown: topic.references.length > 0,
    },
    { id: "changes", label: "Change log", shown: topic.changes.length > 0 },
    { id: "comments", label: "Discussion", shown: true },
  ].filter((entry) => entry.shown);

  return (
    <article className={`wide ${styles.topicLayout}`}>
      <header className={styles.topicHeader}>
        {topic.countries.length > 0 ? (
          <p className={styles.cardCountries}>
            {topic.countries.map((country) => (
              <Link key={country.slug} href={`/countries/${country.slug}`}>
                {country.name}
              </Link>
            ))}
          </p>
        ) : null}
        <h1>{topic.title}</h1>
        <p className="lede">{topic.summary}</p>
        <p className={styles.meta}>
          {topic.firstPublishedAt
            ? `Published ${formatDate(topic.firstPublishedAt)}`
            : null}
          {updated ? ` · Updated ${formatDate(updated)}` : null}
        </p>
        {topic.state === "archived" ? (
          <p className={`notice ${styles.archived}`}>
            This topic is archived: it is kept for the record and no longer
            appears in lists. See the change log below for why.
          </p>
        ) : null}
      </header>

      <aside className={styles.aside} aria-label="About this topic">
        {topic.category || topic.people.length > 0 || topic.tags.length > 0 ? (
          <section className={styles.asideCard} aria-labelledby="in-topic">
            <h2 id="in-topic">In this topic</h2>
            {topic.category ? (
              <div className={styles.asideGroup}>
                <p className={styles.meta}>Category</p>
                <ul className={styles.chips}>
                  <li>
                    <span className={styles.chip}>{topic.category.name}</span>
                  </li>
                </ul>
              </div>
            ) : null}
            {topic.people.length > 0 ? (
              <dl className={styles.people}>
                {peopleByRole(topic.people).map(([role, individuals]) => (
                  <div key={role} className={styles.pair}>
                    <dt>{PERSON_ROLE_LABELS[role]}</dt>
                    <dd>
                      <ul className={styles.names}>
                        {individuals.map((individual) => (
                          <li key={individual.slug}>
                            <Link href={`/individuals/${individual.slug}`}>
                              {individual.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {topic.tags.length > 0 ? (
              <div className={styles.asideGroup}>
                <p className={styles.meta}>Tags</p>
                <ul className={styles.chips}>
                  {topic.tags.map((tag) => (
                    <li key={tag.slug}>
                      <span className={styles.chip}>{tag.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        <nav
          className={`${styles.asideCard} ${styles.contents}`}
          aria-labelledby="on-page"
        >
          <h2 id="on-page">On this page</h2>
          <ul className={styles.toc}>
            {contents.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`}>{entry.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className={styles.topicContent}>
        <section id="topic-text" className={styles.section} aria-label="Topic">
          <TopicBody body={topic.body} links={topic.bodyLinks} />
        </section>

        {topic.evidence.length > 0 ? (
          <section className={styles.section} aria-labelledby="evidence">
            <h2 id="evidence">
              Evidence{" "}
              <span className={styles.tally}>{topic.evidence.length}</span>
            </h2>
            <EvidenceList evidence={topic.evidence} />
          </section>
        ) : null}

        {topic.references.length > 0 ? (
          <section className={styles.section} aria-labelledby="references">
            <h2 id="references">
              References{" "}
              <span className={styles.tally}>{topic.references.length}</span>
            </h2>
            <ReferenceList references={topic.references} />
          </section>
        ) : null}

        {topic.changes.length > 0 ? (
          <section className={styles.section} aria-labelledby="changes">
            <h2 id="changes">Change log</h2>
            <ol className={styles.changes}>
              {topic.changes.map((change, index) => (
                <li key={index}>
                  <strong>{TOPIC_CHANGE_LABELS[change.kind]}</strong>
                  <span className={styles.meta}>
                    {" · "}
                    {formatDate(change.date)}
                  </span>
                  <br />
                  {change.note}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <CommentSection slug={topic.slug} />
      </div>
    </article>
  );
}
