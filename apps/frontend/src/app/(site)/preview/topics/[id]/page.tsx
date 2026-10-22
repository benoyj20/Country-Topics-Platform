import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { adminGate } from "@/admin/gate";
import { readTopicPreview } from "@/admin/topics/backend";
import { TopicArticle } from "@/components/public/TopicArticle";
import styles from "@/components/public/public.module.css";

// Rendered for each request with the staff member's cookie, never cached:
// a draft is staff-only, and each preview shows it as it is now.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview - Country Topics",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

/**
 * A topic's newest draft as its page will look once published (ADR 0014,
 * live preview), in the site's own layout: the admin's editor shows it
 * beside the form, and reloads it after each save.
 */
export default async function TopicPreview({ params }: Props) {
  const { id } = await params;
  const gate = await adminGate(`/preview/topics/${encodeURIComponent(id)}`);
  if (!gate.ok) {
    return (
      <div className="notice error">
        <p>Only staff who passed the admin&apos;s check can preview drafts.</p>
        <p>
          <Link href="/admin">Go to the admin</Link>
        </p>
      </div>
    );
  }
  const topic = await readTopicPreview(id);
  if (!topic) notFound();
  return (
    <>
      <p className="notice">
        A preview of the newest draft, as visitors will see it once it is
        published. Visitors do not see this page.
      </p>
      <TopicArticle
        topic={topic}
        discussion={
          <section
            id="comments"
            className={styles.section}
            aria-label="Discussion"
          >
            <p className="notice">
              The topic&apos;s discussion appears here on the site.
            </p>
          </section>
        }
      />
    </>
  );
}
