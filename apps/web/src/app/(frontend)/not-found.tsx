import Link from "next/link";

export default function NotFound() {
  return (
    <section className="stack">
      <h1>Page not found</h1>
      <p className="muted">
        There is no published page at this address. It may not be published yet,
        or its link may have changed.
      </p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </section>
  );
}
