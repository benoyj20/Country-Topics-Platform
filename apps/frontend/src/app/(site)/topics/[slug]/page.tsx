import type { TopicPage } from "@countrytopics/contracts";
import { isSlug } from "@countrytopics/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { topicPage } from "@/backend/page-data";
import { CommentSection } from "@/components/comments/CommentSection";
import { TopicArticle } from "@/components/public/TopicArticle";

// Rendered on a page's first visit, then cached for everyone and purged when
// content changes (ADR 0007); equal to PAGE_DATA_LIFETIME_S.
export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]): Promise<TopicPage> {
  const { slug } = await params;
  const topic = isSlug(slug) ? await topicPage(slug) : null;
  if (!topic) notFound();
  return topic;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await load(params);
  return {
    title: `${topic.title} - Country Topics`,
    description: topic.summary,
  };
}

export default async function TopicPageView({ params }: Props) {
  const topic = await load(params);
  return (
    <TopicArticle
      topic={topic}
      discussion={<CommentSection slug={topic.slug} />}
    />
  );
}
