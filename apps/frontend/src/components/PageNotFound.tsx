import Link from "next/link";

/**
 * What a missing page says: for a missing topic, country, or person, and
 * for an address that matches no page at all.
 */
export function PageNotFound() {
  return (
    <section className="stack not-found">
      <p className="eyebrow">Error 404</p>
      <h1>Page not found</h1>
      <p className="muted">
        There is no published page at this address. It may not be published yet,
        or its link may have changed.
      </p>
      <p className="actions">
        <Link className="button" href="/">
          Go to the home page
        </Link>
        <Link className="button secondary" href="/topics">
          Browse topics
        </Link>
      </p>
    </section>
  );
}
