import { browseHref } from "@countrytopics/contracts";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Form from "next/form";
import Link from "next/link";

import {
  BookIcon,
  DocumentIcon,
  GlobeArt,
  VideoIcon,
} from "@/components/public/icons";
import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";
import { homePage } from "@/public/cached";

// Cached for everyone and purged when content changes (ADR 0007); equal to
// PUBLIC_REVALIDATE_S, written out because Next.js reads it as a literal.
export const revalidate = 3600;

/**
 * The home page that `next build` writes. It is never served: with the
 * shared cache (ADR 0013) the first visit renders the page and stores it.
 * So the build needs no database, and a container image can be built
 * without one.
 */
const AT_BUILD: Awaited<ReturnType<typeof homePage>> = {
  topics: { items: [], more: false },
  countries: [],
};

export default async function HomePage() {
  const { topics, countries } =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
      ? AT_BUILD
      : await homePage();
  return (
    <div className="wide">
      <section className={styles.hero} aria-labelledby="home-title">
        <GlobeArt className={styles.heroGlobe} />
        <h1 id="home-title">Country Topics</h1>
        <p>
          Topics organised by country, each backed by evidence: timestamped
          video snippets with their transcripts, documents, archived pages, and
          references to the books, papers, and reports that support or
          contradict them.
        </p>

        {/* Next.js's form: a client-side navigation to /topics?q=..., and a
            plain GET form before the page's script loads. */}
        <Form role="search" action="/topics" className={styles.searchForm}>
          <label htmlFor="home-q" className="visually-hidden">
            Search topics
          </label>
          <input
            id="home-q"
            name="q"
            type="search"
            maxLength={200}
            placeholder="Search topics, people, and what they said"
          />
          <button type="submit" className="button">
            Search
          </button>
        </Form>
      </section>

      <ul className={styles.features}>
        <li className={styles.feature}>
          <span className={styles.featureIcon}>
            <VideoIcon />
          </span>
          <div>
            <h2>Video snippets</h2>
            <p>The moment something was said, with its transcript.</p>
          </div>
        </li>
        <li className={styles.feature}>
          <span className={styles.featureIcon}>
            <DocumentIcon />
          </span>
          <div>
            <h2>Documents and archives</h2>
            <p>Files and archived copies of the pages a topic relies on.</p>
          </div>
        </li>
        <li className={styles.feature}>
          <span className={styles.featureIcon}>
            <BookIcon />
          </span>
          <div>
            <h2>References</h2>
            <p>Books, papers, and reports that support or contradict it.</p>
          </div>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="latest">
        <div className={styles.sectionHead}>
          <h2 id="latest">Latest topics</h2>
          {topics.items.length > 0 ? (
            <Link href={browseHref()}>Browse all topics →</Link>
          ) : null}
        </div>
        <TopicList
          topics={topics}
          empty="No topics are published yet."
          moreHref={browseHref()}
          layout="grid"
        />
      </section>

      {countries.length > 0 ? (
        <section className={styles.section} aria-labelledby="countries">
          <h2 id="countries">Countries</h2>
          <ul className={styles.countryGrid}>
            {countries.map((country) => (
              <li key={country.slug}>
                <Link
                  className={styles.countryLink}
                  href={`/countries/${country.slug}`}
                >
                  {country.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
