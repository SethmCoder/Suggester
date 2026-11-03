export type PopularityProviderId =
  | "travel_feeds"
  | "serp_trends"
  | "google_places";

export interface PopularityConfig {
  enabled: boolean;
  providers: PopularityProviderId[];
  cacheTtlHours: number;
  weight: number;
  minConfidence: number;
  maxMentionsPerRefresh: number;
}

function parseProviders(raw: string | undefined): PopularityProviderId[] {
  const allowed: PopularityProviderId[] = [
    "travel_feeds",
    "serp_trends",
    "google_places",
  ];
  if (!raw?.trim()) {
    return ["travel_feeds", "google_places"];
  }
  return raw
    .split(",")
    .map((s) => s.trim() as PopularityProviderId)
    .filter((p) => allowed.includes(p));
}

export function getPopularityConfig(): PopularityConfig {
  return {
    enabled: process.env.POPULARITY_ENABLED !== "false",
    providers: parseProviders(process.env.POPULARITY_PROVIDERS),
    cacheTtlHours: Number(process.env.POPULARITY_CACHE_TTL_HOURS ?? "168"),
    weight: Math.min(1, Math.max(0, Number(process.env.POPULARITY_WEIGHT ?? "0.35"))),
    minConfidence: Math.min(
      1,
      Math.max(0, Number(process.env.POPULARITY_MIN_CONFIDENCE ?? "0.45")),
    ),
    maxMentionsPerRefresh: Number(
      process.env.POPULARITY_MAX_MENTIONS_PER_REFRESH ?? "80",
    ),
  };
}
