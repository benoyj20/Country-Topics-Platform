import Link from "next/link";
import { connection } from "next/server";

import {
  Contact,
  DraftNotice,
  Operator,
  ToDecide,
} from "@/components/legal/legal-parts";

export const metadata = { title: "Privacy policy - Country Topics" };

// The draft privacy policy (ADR 0011). It describes what the code does;
// change it in the same PR as anything that changes what is collected,
// who receives it, or how long it is kept.
export default async function PrivacyPage() {
  // Who runs the site comes from the server's configuration at request
  // time, not from the build.
  await connection();
  return (
    <article className="stack">
      <h1>Privacy policy</h1>
      <p className="muted">Draft of 17 October 2026</p>
      <DraftNotice />

      <h2>Who we are</h2>
      <p>
        Country Topics is run by <Operator />. Write to <Contact /> with any
        question about your data. During the pilot the site runs on that
        person&apos;s own computer and is open only to invited testers.{" "}
        <ToDecide>
          where that computer is, and which data protection laws apply
        </ToDecide>
      </p>

      <h2>What we keep about you, and why</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address, the role you were
          invited with, and who invited you and when. If you sign in with
          Google, Google also gives us your name and the address of your profile
          picture; we ask Google for nothing else. We need these to let you sign
          in.
        </li>
        <li>
          <strong>Your public name:</strong> the name you choose to show with
          your comments. Your email address and sign-in name are never shown
          publicly.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> a cookie keeps you signed in. With
          each session we store when it started, the IP address it started from,
          and your browser&apos;s description of itself (its user agent), so
          that you and we can recognise sessions. A session ends about a week
          after you last use the site, or when you sign out. Sign-in attempts
          are also counted per IP address, to stop abuse.
        </li>
        <li>
          <strong>What you post:</strong> your comments, votes, reports, and
          feedback, and the notifications the site makes for you. Comments show
          your public name and the time to anyone who opens the topic. Votes
          count in scores but are never shown one by one. Reports and feedback
          are seen only by staff.
        </li>
        <li>
          <strong>Records of changes:</strong> the site keeps a log of changes
          to accounts and of moderators&apos; and admins&apos; actions,
          including when an account was created and deleted and its email
          address, so we know who had access and why content changed.
        </li>
        <li>
          <strong>Staff only:</strong> moderators and admins also set up an
          authenticator app; we store its secret to check their codes.
        </li>
      </ul>
      <p>
        Moderators and admins see what you post and report. Admins also see your
        account details. We do not sell your data, show ads, or use analytics.
      </p>

      <h2>Cookies and other sites</h2>
      <ul>
        <li>
          The site&apos;s own cookies are only those needed to sign in and stay
          signed in.
        </li>
        <li>
          <strong>Google</strong> handles Google sign-in if you choose it.
        </li>
        <li>
          <strong>YouTube</strong> videos load only after you press play, from
          YouTube&apos;s privacy-enhanced domain (youtube-nocookie.com). Once a
          video loads, YouTube, which is part of Google, receives your IP
          address and may store data in your browser under Google&apos;s privacy
          policy.
        </li>
        <li>
          <strong>Cloudflare</strong> checks that the email sign-in form is used
          by a person (Turnstile), and, from the start of the pilot, carries
          every request to the site.
        </li>
        <li>
          An email service sends sign-in links to your address.{" "}
          <ToDecide>which email service</ToDecide>
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and what you post: until you delete your account.</li>
        <li>Sign-in links: 10 minutes. Sessions: as above.</li>
        <li>
          When you delete your account, your profile, sign-in, sessions,
          notifications, and feedback are deleted, and the text of your comments
          is erased. Replies by others stay. Your votes stay in comment scores
          and your reports stay for moderators, without your name or any link to
          you.
        </li>
        <li>
          The record of changes keeps your email address and the dates your
          account was created and deleted, and the invitation you accepted stays
          on the invitation list.{" "}
          <ToDecide>how long these records are kept</ToDecide>
        </li>
        <li>
          Backups of the site hold older copies of this data until they are
          replaced. <ToDecide>how long backups are kept</ToDecide>
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          Change your public name, download a copy of your data, or delete your
          account on <Link href="/account">your account page</Link>.
        </li>
        <li>
          For anything else, such as correcting your data or objecting to how we
          use it, write to <Contact />.{" "}
          <ToDecide>
            the legal basis for each use, and how to complain to a data
            protection authority
          </ToDecide>
        </li>
      </ul>

      <h2>People named in topics</h2>
      <p>
        Topics name real people. Every statement about a named person must link
        to evidence and at least one reference, and changes to published topics
        are logged where everyone can see them. If you are named in a topic and
        think something is wrong, write to <Contact />.
      </p>

      <h2>Children</h2>
      <p>
        <ToDecide>the minimum age for an account</ToDecide>
      </p>

      <h2>Changes to this policy</h2>
      <p>
        When this policy changes, the date at the top changes.{" "}
        <ToDecide>how members are told about changes</ToDecide>
      </p>
    </article>
  );
}
