import type { OnlineInterestSignal } from "./types";

export interface DiscoveryRankWeights {
  relevance: number;
  geography: number;
  quality: number;
  onlineInterest: number;
}

export const DEFAULT_DISCOVERY_WEIGHTS: DiscoveryRankWeights = {
  relevance: 0.65,
  geography: 0.15,
  quality: 0.1,
  onlineInterest: 0.1,
};

export function getDiscoveryRankWeights(): DiscoveryRankWeights {
  const relevance = numEnv("DISCOVERY_WEIGHT_RELEVANCE", 0.65);
  const geography = numEnv("DISCOVERY_WEIGHT_GEOGRAPHY", 0.15);
  const quality = numEnv("DISCOVERY_WEIGHT_QUALITY", 0.1);
  const onlineInterest = numEnv("DISCOVERY_WEIGHT_ONLINE_INTEREST", 0.1);
  const sum = relevance + geography + quality + onlineInterest;
  if (sum <= 0) return { ...DEFAULT_DISCOVERY_WEIGHTS };
  return {
    relevance: relevance / sum,
    geography: geography / sum,
    quality: quality / sum,
    onlineInterest: onlineInterest / sum,
  };
}

function numEnv(key: string, fallback: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * When online interest is unavailable, redistribute its weight proportionally
 * across the other criteria (never invent a popularity score).
 */
export function effectiveWeights(
  base: DiscoveryRankWeights,
  hasOnlineInterest: boolean,
): DiscoveryRankWeights {
  if (hasOnlineInterest) return base;
  const rest = base.relevance + base.geography + base.quality;
  if (rest <= 0) {
    return { relevance: 1, geography: 0, quality: 0, onlineInterest: 0 };
  }
  const share = base.onlineInterest;
  return {
    relevance: base.relevance + (base.relevance / rest) * share,
    geography: base.geography + (base.geography / rest) * share,
    quality: base.quality + (base.quality / rest) * share,
    onlineInterest: 0,
  };
}

export function onlineInterestScore(
  signal: OnlineInterestSignal | null | undefined,
): { score: number; usable: boolean } {
  if (!signal || !signal.classification || signal.confidence === "none") {
    return { score: 0, usable: false };
  }
  const confBoost =
    signal.confidence === "high"
      ? 1
      : signal.confidence === "medium"
        ? 0.75
        : 0.5;
  let base = 0.5;
  if (signal.classification === "increasing") base = 0.85;
  else if (signal.classification === "decreasing") base = 0.25;
  else base = 0.5;
  return { score: base * confBoost, usable: true };
}

export function placeQualityScore(input: {
  hasAddress?: boolean;
  hasWikipedia?: boolean;
  tagCount?: number;
  hoursVerified?: boolean;
}): number {
  let s = 0.35;
  if (input.hasAddress) s += 0.2;
  if (input.hasWikipedia) s += 0.25;
  if ((input.tagCount ?? 0) >= 4) s += 0.1;
  if (input.hoursVerified) s += 0.1;
  return Math.min(1, s);
}

export function combineDiscoveryRank(input: {
  relevance: number;
  geography: number;
  quality: number;
  interest: OnlineInterestSignal | null | undefined;
  prefersHiddenGems?: boolean;
  weights?: DiscoveryRankWeights;
}): number {
  const base = input.weights ?? getDiscoveryRankWeights();
  const { score: interestScore, usable } = onlineInterestScore(input.interest);
  let w = effectiveWeights(base, usable);

  if (input.prefersHiddenGems && usable) {
    // Reduce online-interest influence for hidden-gem preference
    const cut = w.onlineInterest * 0.7;
    w = {
      ...w,
      onlineInterest: w.onlineInterest - cut,
      relevance: w.relevance + cut * 0.6,
      quality: w.quality + cut * 0.4,
    };
  }

  const invInterest = input.prefersHiddenGems
    ? 1 - interestScore
    : interestScore;

  return (
    w.relevance * clamp01(input.relevance) +
    w.geography * clamp01(input.geography) +
    w.quality * clamp01(input.quality) +
    w.onlineInterest * clamp01(invInterest)
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
