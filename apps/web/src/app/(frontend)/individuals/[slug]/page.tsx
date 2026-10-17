import { isSlug } from "@countrytopics/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EvidenceList } from "@/components/public/EvidenceList";
import { FileCredit } from "@/components/public/FileCredit";
import { SourceList } from "@/components/public/ReferenceList";
import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";
import { individualPage } from "@/public/cached";
import type { IndividualPage } from "@/public/types";

// Rendered on a page's first visit, then cached for everyone and purged when
// content changes (ADR 0007); equal to PUBLIC_REVALIDATE_S.
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]): Promise<IndividualPage> {
  const { slug } = await params;
  const individual = isSlug(slug) ? await individualPage(slug) : null;
  if (!individual) notFound();
  return individual;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const individual = await load(params);
  return {
    title: `${individual.name} - Country Topics`,
    description: `${individual.name}: topics on Country Topics, with their evidence and references.`,
  };
}

export default async function IndividualPageView({ params }: Props) {
  const individual = await load(params);

  return (
    <div className="stack">
      <header className={styles.profile}>
        {individual.photo ? (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by /files with its own cache headers; no resizing yet */}
            <img
              src={individual.photo.url}
              alt={individual.photo.alt}
              width={individual.photo.width ?? undefined}
              height={individual.photo.height ?? undefined}
            />
            <figcaption>
              <FileCredit file={individual.photo} />
            </figcaption>
          </figure>
        ) : null}
        <div className={styles.profileText}>
          <h1>{individual.name}</h1>
          {individual.aliases.length > 0 ? (
            <p className={styles.meta}>
              Also known as {individual.aliases.join(", ")}
            </p>
          ) : null}
        </div>
      </header>

      {individual.statements.length > 0 ? (
        <section className={styles.section} aria-labelledby="profile">
          <h2 id="profile">Profile</h2>
          <ul className={styles.statements}>
            {individual.statements.map((statement, index) => (
              <li key={index} className={styles.item}>
                <p className={styles.bio}>{statement.text}</p>
                <details className={styles.backing}>
                  <summary>Evidence and sources</summary>
                  <EvidenceList evidence={statement.evidence} />
                  <SourceList sources={statement.sources} />
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="muted">
        Everything this site says about {individual.name} comes with its
        evidence and references: under each statement above, and in the topics
        below.
      </p>

      <section className={styles.section} aria-labelledby="topics">
        <h2 id="topics">Topics</h2>
        <TopicList
          topics={individual.topics}
          empty="No current topics name this person; archived topics may still link here."
        />
      </section>

      {individual.links.length > 0 ? (
        <section className={styles.section} aria-labelledby="links">
          <h2 id="links">Links</h2>
          <ul className={styles.names}>
            {individual.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
