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

  return (
    <article className="stack">
      <header className="stack">
        <ul className={styles.chips} aria-label="Countries">
          {topic.countries.map((country) => (
            <li key={country.slug}>
              <Link className={styles.chip} href={`/countries/${country.slug}`}>
                {country.name}
              </Link>
            </li>
          ))}
          {topic.category ? (
            <li>
              <span className={styles.chip}>{topic.category.name}</span>
            </li>
          ) : null}
        </ul>
        <h1>{topic.title}</h1>
        <p className={styles.lede}>{topic.summary}</p>
        <p className={styles.meta}>
          {topic.firstPublishedAt
            ? `Published ${formatDate(topic.firstPublishedAt)}`
            : null}
          {updated ? ` · Updated ${formatDate(updated)}` : null}
        </p>
        {topic.state === "archived" ? (
          <p className="notice">
            This topic is archived: it is kept for the record and no longer
            appears in lists. See the change log below for why.
          </p>
        ) : null}
      </header>

      {topic.people.length > 0 ? (
        <section className={styles.section} aria-labelledby="people">
          <h2 id="people">Individuals</h2>
          <dl className="details">
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
        </section>
      ) : null}

      <section className={styles.section} aria-label="Topic">
        <TopicBody body={topic.body} links={topic.bodyLinks} />
      </section>

      {topic.evidence.length > 0 ? (
        <section className={styles.section} aria-labelledby="evidence">
          <h2 id="evidence">Evidence</h2>
          <EvidenceList evidence={topic.evidence} />
        </section>
      ) : null}

      {topic.references.length > 0 ? (
        <section className={styles.section} aria-labelledby="references">
          <h2 id="references">References</h2>
          <ReferenceList references={topic.references} />
        </section>
      ) : null}

      {topic.tags.length > 0 ? (
        <section className={styles.section} aria-labelledby="tags">
          <h2 id="tags">Tags</h2>
          <ul className={styles.chips}>
            {topic.tags.map((tag) => (
              <li key={tag.slug}>
                <span className={styles.chip}>{tag.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.changes.length > 0 ? (
        <section className={styles.section} aria-labelledby="changes">
          <h2 id="changes">Change log</h2>
          <ol className={styles.changes}>
            {topic.changes.map((change, index) => (
              <li key={index}>
                <strong>{TOPIC_CHANGE_LABELS[change.kind]}</strong>,{" "}
                {formatDate(change.date)}: {change.note}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <CommentSection slug={topic.slug} />
    </article>
  );
}
