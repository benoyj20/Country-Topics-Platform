import Form from "next/form";
import Link from "next/link";

import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";
import { browseHref } from "@/public/browse-query";
import { homePage } from "@/public/cached";

// Cached for everyone and purged when content changes (ADR 0007); equal to
// PUBLIC_REVALIDATE_S, written out because Next.js reads it as a literal.
export const revalidate = 3600;

export default async function HomePage() {
  const { topics, countries } = await homePage();
  return (
    <div className="stack">
      <h1>Country Topics</h1>
      <p className="muted">
        Topics organised by country, each backed by evidence: timestamped video
        snippets with their transcripts, documents, archived pages, and
        references to the books, papers, and reports that support or contradict
        them.
      </p>

      {/* Next.js's form: a client-side navigation to /topics?q=..., and a
          plain GET form before the page's script loads. */}
      <Form role="search" action="/topics" className={styles.searchForm}>
        <label htmlFor="home-q" className={styles.visuallyHidden}>
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

      <section className={styles.section} aria-labelledby="latest">
        <h2 id="latest">Latest topics</h2>
        <TopicList
          topics={topics}
          empty="No topics are published yet."
          moreHref={browseHref()}
        />
        {topics.items.length > 0 ? (
          <p className={styles.meta}>
            <Link href={browseHref()}>
              Browse all topics by country, person, and evidence
            </Link>
          </p>
        ) : null}
      </section>

      {countries.length > 0 ? (
        <section className={styles.section} aria-labelledby="countries">
          <h2 id="countries">Countries</h2>
          <ul className={styles.chips}>
            {countries.map((country) => (
              <li key={country.slug}>
                <Link
                  className={styles.chip}
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
