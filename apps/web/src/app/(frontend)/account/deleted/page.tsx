import Link from "next/link";

export const metadata = { title: "Account deleted - Country Topics" };

// Where the browser goes after a member deletes their account (ADR 0011).
export default function AccountDeletedPage() {
  return (
    <section className="stack auth-card">
      <h1>Your account was deleted</h1>
      <p>
        Your comments&apos; text, notifications, feedback, and sign-in are gone.
        Thank you for taking part.
      </p>
      <p className="muted">
        To come back, you need a new invitation. See the{" "}
        <Link href="/privacy">privacy policy</Link> for what the site keeps.
      </p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </section>
  );
}
