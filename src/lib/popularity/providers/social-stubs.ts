import type { RawMention } from "../types";

/** Meta Graph API — requires META_GRAPH_ACCESS_TOKEN; no scraping. */
export async function fetchInstagramMentions(
  _destination: string,
  _hashtags: string[],
): Promise<RawMention[]> {
  if (!process.env.META_GRAPH_ACCESS_TOKEN) return [];
  // Integration point for authorized Instagram Graph hashtag search.
  return [];
}

/** TikTok Research / Marketing API — requires TIKTOK_API_ACCESS_TOKEN. */
export async function fetchTikTokMentions(
  _destination: string,
): Promise<RawMention[]> {
  if (!process.env.TIKTOK_API_ACCESS_TOKEN) return [];
  return [];
}
