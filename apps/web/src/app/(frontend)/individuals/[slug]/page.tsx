import { isSlug } from "@countrytopics/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FileCredit } from "@/components/public/FileCredit";
import { SourceList } from "@/components/public/ReferenceList";
import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";
import { individualPage } from "@/public/cached";
import { formatPeriod } from "@/public/format";
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
    description: individual.summary ?? undefined,
  };
}

export default async function IndividualPageView({ params }: Props) {
  const individual = await load(params);
  const links = [
    ...individual.links,
    ...(individual.wikidataId
      ? [
          {
            label: "Wikidata",
            url: `https://www.wikidata.org/wiki/${individual.wikidataId}`,
          },
        ]
      : []),
  ];

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
          {individual.summary ? (
            <p className={styles.lede}>{individual.summary}</p>
          ) : null}
          {individual.aliases.length > 0 ? (
            <p className={styles.meta}>
              Also known as {individual.aliases.join(", ")}
            </p>
          ) : null}
        </div>
      </header>

      {individual.backed ? (
        <>
          {individual.backed.bio ? (
            <section className={styles.section} aria-label="Biography">
              <p className={styles.bio}>{individual.backed.bio}</p>
            </section>
          ) : null}
          {individual.backed.countries.length > 0 ? (
            <section className={styles.section} aria-labelledby="roles">
              <h2 id="roles">Roles</h2>
              <ul className={styles.roles}>
                {individual.backed.countries.map((role, index) => (
                  <li key={index}>
                    {[
                      role.role,
                      <Link
                        key="country"
                        href={`/countries/${role.country.slug}`}
                      >
                        {role.country.name}
                      </Link>,
                      formatPeriod(role.startDate, role.endDate),
                    ]
                      .filter(Boolean)
                      .map((part, partIndex) => (
                        <span key={partIndex}>
                          {partIndex > 0 ? ", " : null}
                          {part}
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="muted">
          What this site says about {individual.name} is in the topics below,
          each with its evidence and references.
        </p>
      )}

      <section className={styles.section} aria-labelledby="topics">
        <h2 id="topics">Topics</h2>
        <TopicList
          topics={individual.topics}
          empty="No current topics name this person; archived topics may still link here."
        />
      </section>

      {individual.backed ? (
        <section className={styles.section} aria-labelledby="sources">
          <h2 id="sources">Sources for this profile</h2>
          <SourceList sources={individual.backed.sources} />
        </section>
      ) : null}

      {links.length > 0 ? (
        <section className={styles.section} aria-labelledby="links">
          <h2 id="links">Links</h2>
          <ul className={styles.names}>
            {links.map((link) => (
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
