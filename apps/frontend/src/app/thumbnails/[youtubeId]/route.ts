import { thumbnailResponse } from "@/thumbnails";

// A video's thumbnail, from YouTube's image server on the visitor's behalf
// (thumbnails.ts).

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ youtubeId: string }> },
): Promise<Response> {
  const { youtubeId } = await params;
  return thumbnailResponse(youtubeId);
}
