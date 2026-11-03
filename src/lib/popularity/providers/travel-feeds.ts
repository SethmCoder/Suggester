import Parser from "rss-parser";
import type { RawMention } from "../types";
import { extractPlaceNamesFromText } from "../extract-mentions";

const parser = new Parser({ timeout: 8000 });

function sponsoredHint(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("sponsored") ||
    lower.includes("#ad") ||
    lower.includes("paid partnership")
  );
}

async function fetchGoogleNewsRss(destination: string): Promise<RawMention[]> {
  const q = encodeURIComponent(`${destination} travel places to visit`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).slice(0, 25).map((item) => ({
      source: "google_news_travel",
      title: item.title ?? "",
      snippet: item.contentSnippet ?? item.content ?? "",
      url: item.link ?? "",
      publishedAt: item.pubDate ? new Date(item.pubDate) : null,
      isSponsored: sponsoredHint(`${item.title ?? ""} ${item.contentSnippet ?? ""}`),
    }));
  } catch {
    return [];
  }
}

const TRAVEL_RSS = [
  "https://www.lonelyplanet.com/feeds/destinations.rss",
  "https://www.nationalgeographic.com/pages/topic/travel/feed/",
];

async function fetchStaticFeeds(destination: string): Promise<RawMention[]> {
  const destLower = destination.toLowerCase();
  const mentions: RawMention[] = [];
  for (const feedUrl of TRAVEL_RSS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of (feed.items ?? []).slice(0, 15)) {
        const blob = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
        if (!blob.toLowerCase().includes(destLower)) continue;
        mentions.push({
          source: new URL(feedUrl).hostname,
          title: item.title ?? "",
          snippet: item.contentSnippet ?? "",
          url: item.link ?? "",
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          isSponsored: sponsoredHint(blob),
        });
      }
    } catch {
      /* feed unavailable — skip */
    }
  }
  return mentions;
}

export async function fetchTravelFeedMentions(
  destination: string,
): Promise<{ mentions: RawMention[]; extractedNames: string[] }> {
  const [news, feeds] = await Promise.all([
    fetchGoogleNewsRss(destination),
    fetchStaticFeeds(destination),
  ]);
  const mentions = [...news, ...feeds];
  const extracted = new Set<string>();
  for (const m of mentions) {
    for (const name of extractPlaceNamesFromText(
      `${m.title} ${m.snippet}`,
      destination,
    )) {
      extracted.add(name);
    }
  }
  return { mentions, extractedNames: [...extracted] };
}
