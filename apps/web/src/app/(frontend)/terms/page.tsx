import Link from "next/link";
import { connection } from "next/server";

import {
  Contact,
  DraftNotice,
  Operator,
  ToDecide,
} from "@/components/legal/legal-parts";

export const metadata = { title: "Terms - Country Topics" };

// The draft terms of use (ADR 0011). The discussion rules match what
// moderators act on (the report reasons) and the limits the site enforces
// (ADR 0010); change them together.
export default async function TermsPage() {
  // Who runs the site comes from the server's configuration at request
  // time, not from the build.
  await connection();
  return (
    <article className="stack">
      <h1>Terms of use</h1>
      <p className="muted">Draft of 17 October 2026</p>
      <DraftNotice />

      <h2>The pilot</h2>
      <p>
        Country Topics is run by <Operator />. It is in an invite-only pilot:
        features may change, break, or be removed, and the pilot may end. By
        using the site you agree to these terms and to the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>
          Sign in only with the email address or Google account you were invited
          with, and keep your account to yourself.
        </li>
        <li>
          <ToDecide>the minimum age for an account</ToDecide>
        </li>
        <li>
          You can delete your account at any time on{" "}
          <Link href="/account">your account page</Link>.
        </li>
      </ul>

      <h2>Discussion rules</h2>
      <p>Comments must not contain:</p>
      <ul>
        <li>spam or advertising;</li>
        <li>harassment, hate, or threats;</li>
        <li>claims you know to be false, presented as fact;</li>
        <li>other people&apos;s personal details;</li>
        <li>anything unrelated to the topic.</li>
      </ul>
      <p>
        Members can report a comment. Moderators hide comments that break these
        rules and lock threads that get out of hand, and they tell the author
        why. Admins erase a comment&apos;s text when the law requires it. To
        limit spam, new accounts cannot post links for their first three days, a
        comment can hold at most three links, and how often anyone can post is
        limited. An account that keeps breaking the rules may be deleted.{" "}
        <ToDecide>how members can appeal a moderator&apos;s decision</ToDecide>
      </p>

      <h2>What you post</h2>
      <p>
        Your comments stay yours. You let the site show them, with your public
        name, to anyone who opens the topic, until a moderator takes them down
        or you delete your account, which erases their text.
      </p>

      <h2>The site&apos;s content</h2>
      <p>
        Topics are written by the site&apos;s staff from the evidence and
        references they link to. Video snippets play from YouTube, and the
        videos remain their owners&apos;. Content can be wrong or out of date:
        check the evidence, and tell us through{" "}
        <Link href="/feedback">Send feedback</Link> or at <Contact /> when you
        find a mistake.
      </p>

      <h2>Responsibility</h2>
      <p>
        <ToDecide>
          the limits of the operator&apos;s responsibility, and which
          country&apos;s law governs these terms (after legal review)
        </ToDecide>
      </p>

      <h2>Changes to these terms</h2>
      <p>
        When these terms change, the date at the top changes.{" "}
        <ToDecide>how members are told about changes</ToDecide>
      </p>
    </article>
  );
}
