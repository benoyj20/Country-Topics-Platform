import { notFound } from "next/navigation";
import type { ComponentProps } from "react";

import { spikeEnv, topicTag } from "../../backend";
import { TopicBody } from "../../TopicBody";

// Cached in R2 for an hour, and purged early by tag (ADR 0014, "Cache and
// purges").
export const revalidate = 3600;

// As apps/web: none at build time, each rendered and cached on first visit.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type TopicPage = {
  slug: string;
  title: string;
  summary: string;
  body: ComponentProps<typeof TopicBody>["body"];
  bodyLinks: Record<string, string>;
};

export default async function Topic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const response = await fetch(
    `${spikeEnv().BACKEND_URL}/api/v1/pages/topics/${encodeURIComponent(slug)}`,
    { next: { revalidate, tags: [topicTag(slug)] } },
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`page data answered ${response.status}`);
  const topic = (await response.json()) as TopicPage;
  return (
    <article>
      <h1>{topic.title}</h1>
      <p className="lede">{topic.summary}</p>
      <TopicBody body={topic.body} links={topic.bodyLinks} />
      <p className="muted">Rendered at {new Date().toISOString()}</p>
    </article>
  );
}
