import Link from "next/link";

import styles from "@/components/public/public.module.css";
import { TopicList } from "@/components/public/TopicList";
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

      <section className={styles.section} aria-labelledby="latest">
        <h2 id="latest">Latest topics</h2>
        <TopicList topics={topics} empty="No topics are published yet." />
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
