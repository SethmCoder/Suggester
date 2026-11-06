import type { OnlineInterestSignal } from "./types";

export interface DiscoveryRankWeights {
  relevance: number;
  geography: number;
  quality: number;
  onlineInterest: number;
  budget: number;
  pace: number;
  variety: number;
}

export const DEFAULT_DISCOVERY_WEIGHTS: DiscoveryRankWeights = {
  relevance: 0.48,
  geography: 0.14,
  quality: 0.1,
  onlineInterest: 0.08,
  budget: 0.1,
  pace: 0.05,
  variety: 0.05,
};

export function getDiscoveryRankWeights(): DiscoveryRankWeights {
  const weights: DiscoveryRankWeights = {
    relevance: numEnv("DISCOVERY_WEIGHT_RELEVANCE", DEFAULT_DISCOVERY_WEIGHTS.relevance),
    geography: numEnv("DISCOVERY_WEIGHT_GEOGRAPHY", DEFAULT_DISCOVERY_WEIGHTS.geography),
    quality: numEnv("DISCOVERY_WEIGHT_QUALITY", DEFAULT_DISCOVERY_WEIGHTS.quality),
    onlineInterest: numEnv(
      "DISCOVERY_WEIGHT_ONLINE_INTEREST",
      DEFAULT_DISCOVERY_WEIGHTS.onlineInterest,
    ),
    budget: numEnv("DISCOVERY_WEIGHT_BUDGET", DEFAULT_DISCOVERY_WEIGHTS.budget),
    pace: numEnv("DISCOVERY_WEIGHT_PACE", DEFAULT_DISCOVERY_WEIGHTS.pace),
    variety: numEnv("DISCOVERY_WEIGHT_VARIETY", DEFAULT_DISCOVERY_WEIGHTS.variety),
  };
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  if (sum <= 0) return { ...DEFAULT_DISCOVERY_WEIGHTS };
  return {
    relevance: weights.relevance / sum,
    geography: weights.geography / sum,
    quality: weights.quality / sum,
    onlineInterest: weights.onlineInterest / sum,
    budget: weights.budget / sum,
    pace: weights.pace / sum,
    variety: weights.variety / sum,
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
const SIGNAL_KEYS = ["relevance", "geography", "quality", "budget", "pace", "variety"] as const;

export function effectiveWeights(
  base: DiscoveryRankWeights,
  hasOnlineInterest: boolean,
): DiscoveryRankWeights {
  if (hasOnlineInterest) return base;
  const rest = SIGNAL_KEYS.reduce((sum, key) => sum + (base[key] ?? 0), 0);
  if (rest <= 0) {
    return {
      relevance: 1,
      geography: 0,
      quality: 0,
      onlineInterest: 0,
      budget: 0,
      pace: 0,
      variety: 0,
    };
  }
  const share = base.onlineInterest;
  return {
    relevance: base.relevance + (base.relevance / rest) * share,
    geography: base.geography + (base.geography / rest) * share,
    quality: base.quality + (base.quality / rest) * share,
    budget: base.budget + (base.budget / rest) * share,
    pace: base.pace + (base.pace / rest) * share,
    variety: base.variety + (base.variety / rest) * share,
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

export function budgetFitScore(input: {
  types: string[];
  allocation?: string;
  restaurantStyle?: string;
  priceLevel?: number | null;
}): number {
  const types = input.types.join(" ").toLowerCase();
  const food = /restaurant|cafe|fast_food|food/.test(types);
  const outdoor = /park|viewpoint|garden|nature/.test(types);
  if (input.priceLevel != null && Number.isFinite(input.priceLevel)) {
    if (input.allocation === "mostly-free") return input.priceLevel <= 0 ? 1 : input.priceLevel <= 1 ? 0.6 : 0.2;
    if (input.priceLevel <= 1) return 0.75;
    if (input.priceLevel >= 3 && input.allocation === "sights") return 0.35;
  }
  if (input.restaurantStyle === "street" && /fast_food|food_court|cafe/.test(types)) return 0.85;
  if (input.restaurantStyle === "sit-down" && /restaurant/.test(types)) return 0.8;
  if (input.restaurantStyle === "casual" && /cafe|restaurant/.test(types)) return 0.75;
  if (input.allocation === "mostly-free" && outdoor) return 0.8;
  if (input.allocation === "mostly-free" && food) return 0.35;
  if (input.allocation === "food" && food) return 0.8;
  return 0.5;
}

export function paceFitScore(input: { types: string[]; intensity?: string }): number {
  const types = input.types.join(" ").toLowerCase();
  const light = /park|viewpoint|cafe|garden/.test(types);
  const full = /museum|attraction|gallery/.test(types);
  if (input.intensity === "relaxed") return light ? 0.85 : full ? 0.4 : 0.55;
  if (input.intensity === "packed") return full ? 0.8 : 0.55;
  return 0.5;
}

export function combineDiscoveryRank(input: {
  relevance: number;
  geography: number;
  quality: number;
  interest: OnlineInterestSignal | null | undefined;
  prefersHiddenGems?: boolean;
  weights?: DiscoveryRankWeights;
  budget?: number;
  pace?: number;
  variety?: number;
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
    w.onlineInterest * clamp01(invInterest) +
    (w.budget ?? 0) * clamp01(input.budget ?? 0.5) +
    (w.pace ?? 0) * clamp01(input.pace ?? 0.5) +
    (w.variety ?? 0) * clamp01(input.variety ?? 0.5)
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
