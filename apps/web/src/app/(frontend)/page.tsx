import Link from "next/link";

export default function HomePage() {
  return (
    <section className="home">
      <h1>Country Topics</h1>
      <p>
        Topics organised by country, each backed by timestamped video snippets,
        transcripts, and references. The public pages arrive in MVP week 7.
      </p>
      <Link className="button" href="/admin">
        Open the admin panel
      </Link>
    </section>
  );
}
