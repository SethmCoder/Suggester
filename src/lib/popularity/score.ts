import type {
  PlaceMentionAggregate,
  PopularityLabel,
  PopularitySignals,
  RawMention,
  TrendDirection,
} from "./types";

const MS_DAY = 86_400_000;
const HALF_LIFE_DAYS = 45;

function timeDecay(publishedAt: Date | null, now: Date): number {
  if (!publishedAt) return 0.35;
  const ageDays = (now.getTime() - publishedAt.getTime()) / MS_DAY;
  if (ageDays < 0) return 1;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function cappedEngagement(raw?: number): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.log1p(raw) / Math.log1p(10_000);
}

function labelFromSignals(input: {
  sourceCount: number;
  recentShare: number;
  trend: TrendDirection;
}): PopularityLabel {
  if (input.sourceCount >= 3 && input.recentShare >= 0.4) {
    return "multiple_sources";
  }
  if (input.trend === "rising" && input.recentShare >= 0.35) {
    return "gaining_attention";
  }
  if (input.recentShare >= 0.5) {
    return "trending_recent_posts";
  }
  if (input.sourceCount >= 2) {
    return "frequently_featured";
  }
  return null;
}

export function scoreMentionAggregate(
  aggregate: PlaceMentionAggregate,
  placeId: string | null,
  now = new Date(),
): PopularitySignals {
  const organic = aggregate.mentions.filter((m) => !m.isSponsored);
  const bySource = new Set(organic.map((m) => m.source));
  const sourceCount = bySource.size;

  let weighted = 0;
  let recentWeighted = 0;
  const urls: string[] = [];

  for (const m of organic) {
    const decay = timeDecay(m.publishedAt, now);
    const engagement = cappedEngagement(m.engagementHint);
    const w = 0.6 * decay + 0.4 * engagement;
    weighted += w;
    if (decay >= 0.55) recentWeighted += w;
    if (m.url && urls.length < 5) urls.push(m.url);
  }

  const totalWeight = organic.length;
  const mentionNorm = totalWeight
    ? Math.min(1, Math.log1p(totalWeight) / Math.log1p(12))
    : 0;
  const sourceNorm = Math.min(1, sourceCount / 4);
  const recentShare = weighted > 0 ? recentWeighted / weighted : 0;

  const rawScore =
    100 *
    (0.45 * mentionNorm + 0.35 * sourceNorm + 0.2 * Math.min(1, recentShare));

  const score = Math.round(Math.min(100, Math.max(0, rawScore)));
  const { trend, confidence } = inferTrendAndConfidence(
    organic,
    sourceCount,
    now,
  );

  const label =
    score >= 40 && confidence >= 0.45
      ? labelFromSignals({ sourceCount, recentShare, trend })
      : null;

  return {
    placeId,
    displayName: aggregate.normalizedName,
    score,
    confidence,
    trend,
    label,
    sources: [...bySource],
    attributionUrls: urls,
    retrievedAt: now,
  };
}

function inferTrendAndConfidence(
  mentions: RawMention[],
  sourceCount: number,
  now: Date,
): { trend: TrendDirection; confidence: number } {
  if (mentions.length === 0) {
    return { trend: "unknown", confidence: 0 };
  }

  const recent = mentions.filter((m) => {
    if (!m.publishedAt) return false;
    const ageDays = (now.getTime() - m.publishedAt.getTime()) / MS_DAY;
    return ageDays >= 0 && ageDays <= 30;
  }).length;
  const older = mentions.filter((m) => {
    if (!m.publishedAt) return false;
    const ageDays = (now.getTime() - m.publishedAt.getTime()) / MS_DAY;
    return ageDays > 30 && ageDays <= 180;
  }).length;

  let trend: TrendDirection = "stable";
  if (recent >= 2 && recent > older * 1.5) trend = "rising";
  else if (older >= 2 && older > recent * 2) trend = "falling";

  const mentionConf = Math.min(1, mentions.length / 6);
  const sourceConf = Math.min(1, sourceCount / 3);
  const confidence = 0.5 * mentionConf + 0.5 * sourceConf;

  return { trend, confidence: Math.min(1, confidence) };
}

export function combinePersonalizationRank(input: {
  interestMatch: number;
  geoFit: number;
  popularityScore: number;
  popularityConfidence: number;
  popularityWeight: number;
  prefersHiddenGems: boolean;
}): number {
  const w = input.prefersHiddenGems
    ? input.popularityWeight * 0.25
    : input.popularityWeight;
  const pop =
    (input.popularityScore / 100) * input.popularityConfidence * w;
  const personal = (1 - w) * (0.6 * input.interestMatch + 0.4 * input.geoFit);
  const gemBonus = input.prefersHiddenGems
    ? (1 - input.popularityScore / 100) * 0.15
    : 0;
  return personal + pop + gemBonus;
}

export function popularityLabelText(label: PopularityLabel): string | null {
  switch (label) {
    case "trending_recent_posts":
      return "Trending in recent travel posts";
    case "frequently_featured":
      return "Frequently featured by travelers";
    case "multiple_sources":
      return "Popular across multiple travel sources";
    case "gaining_attention":
      return "Gaining attention recently";
    default:
      return null;
  }
}
