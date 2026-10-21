// The topic page with a five-second lifetime instead of an hour, to see a
// stale page refreshed in the background by the Durable Object queue.
import Topic from "../../topics/[slug]/page";

export const revalidate = 5;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default Topic;
