"use client";

import Link from "next/link";

/**
 * A screen the backend could not answer for: shown in the admin's frame,
 * with a way to try again. The error itself is reported by the server.
 */
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="admin-main">
      <section className="admin-card narrow admin-stack" role="alert">
        <h1>This page could not be loaded</h1>
        <p>The backend did not answer as expected. Try again in a moment.</p>
        <div className="admin-row">
          <button type="button" className="admin-button" onClick={reset}>
            Try again
          </button>
          <Link href="/admin">Go to the admin&apos;s start</Link>
        </div>
      </section>
    </main>
  );
}
