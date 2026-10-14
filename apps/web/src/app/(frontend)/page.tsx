import Link from "next/link";

// Static, so it can be cached for everyone; /sign-in sends people who are
// already signed in on to their account.
export default function HomePage() {
  return (
    <section className="home stack">
      <h1>Country Topics</h1>
      <p>
        Topics organised by country, each backed by timestamped video snippets,
        transcripts, and references. The public pages arrive in MVP week 7.
      </p>
      <div>
        <Link className="button" href="/sign-in">
          Sign in
        </Link>
      </div>
    </section>
  );
}
