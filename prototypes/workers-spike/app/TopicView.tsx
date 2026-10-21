import { notFound } from "next/navigation";

import { loadTopicPage } from "./backend";
import { TopicBody } from "./TopicBody";

/** The topic page, its data cached for `lifetimeS` seconds. */
export async function TopicView({
  slug,
  lifetimeS,
}: {
  slug: string;
  lifetimeS: number;
}) {
  const topic = await loadTopicPage(slug, lifetimeS);
  if (!topic) notFound();
  return (
    <article>
      <h1>{topic.title}</h1>
      <p className="lede">{topic.summary}</p>
      <TopicBody body={topic.body} links={topic.bodyLinks} />
      <p className="muted">Rendered at {new Date().toISOString()}</p>
    </article>
  );
}
