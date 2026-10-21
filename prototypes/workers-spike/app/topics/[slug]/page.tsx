import { TopicView } from "../../TopicView";

// Cached in R2 for an hour, and purged early by tag (ADR 0014, "Cache and
// purges").
export const revalidate = 3600;

// As apps/web: none at build time, each rendered and cached on first visit.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default async function Topic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TopicView slug={slug} lifetimeS={revalidate} />;
}
