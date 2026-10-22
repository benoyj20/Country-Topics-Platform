import { feedbackPagePath } from "@countrytopics/domain";
import { redirect } from "next/navigation";

import { currentAccount } from "@/backend/account";

import { FeedbackForm } from "./FeedbackForm";

export const metadata = { title: "Send feedback - Country Topics" };

// Members tell us what works, what does not, and what they would like
// (ADR 0011). Staff read it in the admin panel. `from` is the page the
// footer link was on.
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from =
    typeof params.from === "string" ? feedbackPagePath(params.from) : null;
  if (!(await currentAccount())) {
    const back = from
      ? `/feedback?from=${encodeURIComponent(from)}`
      : "/feedback";
    redirect(`/sign-in?callbackURL=${encodeURIComponent(back)}`);
  }
  return (
    <section className="stack">
      <h1>Send feedback</h1>
      <p className="muted">
        Tell us what works, what does not, and what you would like the site to
        do. Only the site&apos;s staff read it. To report a comment that breaks
        the rules, use its Report button instead.
      </p>
      <FeedbackForm page={from} />
    </section>
  );
}
