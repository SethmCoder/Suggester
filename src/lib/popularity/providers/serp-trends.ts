import type { RawMention } from "../types";

/** Optional SerpApi Google Trends — requires SERPAPI_API_KEY (licensed provider). */
export async function fetchSerpTrendMentions(
  destination: string,
  placeNames: string[],
): Promise<RawMention[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];

  const mentions: RawMention[] = [];
  const queries = placeNames.slice(0, 5).map((n) => `${n} ${destination}`);

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        engine: "google_trends",
        q: q,
        api_key: key,
        data_type: "TIMESERIES",
      });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        interest_over_time?: { timeline_data?: { date?: string; values?: { value?: string }[] }[] };
      };
      const timeline = data.interest_over_time?.timeline_data ?? [];
      const values = timeline.flatMap((t) =>
        (t.values ?? []).map((v) => Number(v.value ?? 0)),
      );
      if (values.length < 2) continue;
      const recent = values.slice(-4).reduce((a, b) => a + b, 0) / 4;
      const older =
        values.slice(0, Math.max(1, values.length - 4)).reduce((a, b) => a + b, 0) /
        Math.max(1, values.length - 4);
      if (recent <= older) continue;
      mentions.push({
        source: "serp_google_trends",
        title: q,
        snippet: `Rising search interest for ${q}`,
        url: "https://trends.google.com/",
        publishedAt: new Date(),
        engagementHint: Math.max(0, recent - older),
      });
    } catch {
      continue;
    }
  }
  return mentions;
}
