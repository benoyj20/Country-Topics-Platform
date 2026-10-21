import { TopicView } from "../../TopicView";

// The topic page with a five-second lifetime, page and data both, to see a
// stale page refreshed with new data in the background by the Durable
// Object queue.
export const revalidate = 5;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default async function ShortTopic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TopicView slug={slug} lifetimeS={revalidate} />;
}
