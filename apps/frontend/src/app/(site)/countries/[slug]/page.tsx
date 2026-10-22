import { browseHref, type CountryPage } from "@countrytopics/contracts";
import { isSlug } from "@countrytopics/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { countryPage } from "@/backend/page-data";
import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";

// Rendered on a page's first visit, then cached for everyone and purged when
// content changes (ADR 0007); equal to PAGE_DATA_LIFETIME_S.
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]): Promise<CountryPage> {
  const { slug } = await params;
  const country = isSlug(slug) ? await countryPage(slug) : null;
  if (!country) notFound();
  return country;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const country = await load(params);
  return {
    title: `${country.name} - Country Topics`,
    description: `Topics about ${country.name}, with their evidence and references.`,
  };
}

export default async function CountryPageView({ params }: Props) {
  const country = await load(params);
  return (
    <div className="wide">
      <header className={styles.pageHeader}>
        <p className="eyebrow">
          {country.region
            ? [country.subregion, country.region].filter(Boolean).join(" · ")
            : "Country"}
        </p>
        <h1>{country.name}</h1>
        <p className="lede">
          Topics about {country.name}, each with its evidence and references.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="topics">
        <h2 id="topics">Topics</h2>
        <TopicList
          topics={country.topics}
          empty={`No topics about ${country.name} yet.`}
          moreHref={browseHref({ country: [country.slug] })}
          layout="grid"
        />
      </section>

      {country.people.length > 0 ? (
        <section className={styles.section} aria-labelledby="people">
          <h2 id="people">People in these topics</h2>
          <ul className={styles.chips}>
            {country.people.map((individual) => (
              <li key={individual.slug}>
                <Link
                  className={styles.chip}
                  href={`/individuals/${individual.slug}`}
                >
                  {individual.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
