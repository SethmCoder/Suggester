import type {
  BudgetTier,
  CompareCriteria,
  DestinationRecord,
  DestinationRecommendation,
  DiscoveryFilters,
  DiscoverInterest,
} from "./types";
import { SCORING_METHODOLOGY } from "./types";
import { destinationImageUrl } from "@/lib/destination-image";
import { resolveGeonameCity } from "@/lib/geonames/cities";

const WEIGHTS = {
  interest: 0.4,
  budget: 0.2,
  duration: 0.15,
  season: 0.15,
  preference: 0.1,
} as const;

export function tierFromBudget(max?: number): BudgetTier | undefined {
  if (max == null || !Number.isFinite(max) || max <= 0) return undefined;
  if (max < 1500) return "lower";
  if (max <= 4000) return "mid";
  return "higher";
}

function interestOverlap(
  destination: DestinationRecord,
  interests: DiscoverInterest[],
): number {
  if (!interests.length) return 0.55;
  const hits = interests.filter((interest) => destination.interests.includes(interest));
  return hits.length / interests.length;
}

function budgetFit(destination: DestinationRecord, filters: DiscoveryFilters): number {
  const wanted = filters.budgetTier ?? tierFromBudget(filters.budgetMax);
  if (!wanted) return 0.55;
  if (destination.budgetTier === wanted) return 1;
  if (
    (wanted === "mid" && destination.budgetTier !== "mid") ||
    (wanted === "lower" && destination.budgetTier === "mid") ||
    (wanted === "higher" && destination.budgetTier === "mid")
  ) {
    return 0.55;
  }
  if (wanted === "lower" && destination.budgetTier === "higher") return 0.15;
  if (wanted === "higher" && destination.budgetTier === "lower") return 0.45;
  return 0.35;
}

function durationFit(destination: DestinationRecord, days?: number): number {
  if (!days) return 0.55;
  if (days >= destination.durationDays.min && days <= destination.durationDays.max) return 1;
  const mid = (destination.durationDays.min + destination.durationDays.max) / 2;
  const distance = Math.abs(days - mid);
  return Math.max(0.15, 1 - distance / 12);
}

function seasonFit(destination: DestinationRecord, filters: DiscoveryFilters): number {
  if (filters.climate === "either" && !filters.seasonMonth) return 0.55;
  const month = filters.seasonMonth;
  if (!month) {
    if (filters.climate === "warm") {
      return destination.warmMonths.length >= 5 ? 0.75 : 0.45;
    }
    if (filters.climate === "cool") {
      return destination.warmMonths.length <= 4 ? 0.75 : 0.4;
    }
    return 0.55;
  }
  const warm = destination.warmMonths.includes(month);
  if (filters.climate === "cool") return warm ? 0.25 : 0.9;
  if (filters.climate === "warm") return warm ? 0.95 : 0.2;
  return warm ? 0.85 : 0.4;
}

export type ScoreContext = {
  savedNames?: string[];
  dream?: string;
  previousDestinations?: string[];
  /** Soft downranks from repeated dismissals (need evidence ≥ 2 before calling). */
  downrankedInterests?: string[];
  preferredDestinations?: string[];
};

function preferenceBoost(
  destination: DestinationRecord,
  filters: DiscoveryFilters,
  context: ScoreContext,
): number {
  let score = 0.4;
  const hay = `${destination.name} ${destination.country} ${destination.experiences.join(" ")} ${destination.attractions.join(" ")}`.toLowerCase();
  for (const name of context.savedNames ?? []) {
    if (hay.includes(name.toLowerCase()) || name.toLowerCase().includes(destination.name.toLowerCase())) {
      score = Math.max(score, 0.85);
    }
  }
  for (const preferred of context.preferredDestinations ?? []) {
    if (
      preferred.toLowerCase().includes(destination.name.toLowerCase()) ||
      destination.name.toLowerCase().includes(preferred.toLowerCase())
    ) {
      score = Math.max(score, 0.8);
    }
  }
  for (const prev of context.previousDestinations ?? []) {
    if (prev.toLowerCase().includes(destination.name.toLowerCase())) score = Math.min(score, 0.2);
  }
  if (context.dream && /architect|history|food|beach|nature|museum|aviation/i.test(context.dream)) {
    const tokens = context.dream.toLowerCase();
    if (destination.interests.some((interest) => tokens.includes(interest))) score = Math.max(score, 0.7);
  }
  for (const down of context.downrankedInterests ?? []) {
    if (destination.interests.includes(down as DiscoverInterest)) {
      score = Math.min(score, 0.25);
    }
  }
  if (filters.similarTo) {
    const similar = filters.similarTo.toLowerCase();
    if (
      destination.similarTo?.some((id) => id.includes(similar) || similar.includes(id)) ||
      destination.name.toLowerCase().includes(similar)
    ) {
      score = Math.max(score, 0.9);
    }
  }
  return score;
}

export function scoreDestination(
  destination: DestinationRecord,
  filters: DiscoveryFilters,
  context: ScoreContext = {},
): DestinationRecommendation {
  const interest = interestOverlap(destination, filters.interests);
  const budget = budgetFit(destination, filters);
  const duration = durationFit(destination, filters.durationDays);
  const season = seasonFit(destination, filters);
  const preference = preferenceBoost(destination, filters, context);
  const score =
    WEIGHTS.interest * interest +
    WEIGHTS.budget * budget +
    WEIGHTS.duration * duration +
    WEIGHTS.season * season +
    WEIGHTS.preference * preference;

  const why: string[] = [];
  if (filters.interests.length) {
    const matched = filters.interests.filter((interestName) =>
      destination.interests.includes(interestName),
    );
    if (matched.length) {
      why.push(`Matches your interest in ${matched.join(", ")}.`);
    } else {
      why.push("Interest overlap is limited for the tags you named.");
    }
  }
  if (filters.budgetMax || filters.budgetTier) {
    why.push(
      `Relative catalog cost band is ${destination.budgetTier} (not a verified price).`,
    );
  }
  if (filters.durationDays) {
    why.push(
      `Suggested stay in the catalog is ${destination.durationDays.min}–${destination.durationDays.max} days for a trip of about ${filters.durationDays} days.`,
    );
  }
  if (filters.seasonMonth || filters.climate === "warm") {
    why.push(seasonNote(destination));
  }
  if (filters.similarTo && destination.similarTo?.length) {
    why.push(`Listed as similar to ${destination.similarTo.join(", ").replace(/-/g, " ")}.`);
  }
  if (!why.length) {
    why.push(
      `Strong catalog tags: ${destination.interests.slice(0, 3).join(", ")}.`,
    );
  }

  const geo = resolveGeonameCity(destination.name);
  const population =
    geo && geo.countryCode === destination.countryCode ? geo.population : null;

  return {
    id: destination.id,
    name: destination.name,
    country: destination.country,
    countryCode: destination.countryCode,
    region: destination.region,
    photoUrl: destinationImageUrl(destination.name),
    why,
    experiences: destination.experiences,
    attractions: destination.attractions,
    seasonsNote: seasonNote(destination),
    seasonsConfidence: "catalog",
    durationNote: `${destination.durationDays.min}–${destination.durationDays.max} days suggested in the catalog`,
    durationConfidence: "estimate",
    budgetNote: budgetNote(destination),
    budgetConfidence: "estimate",
    transitNote: destination.transitNote,
    transitConfidence: "catalog",
    disadvantages: destination.disadvantages,
    score,
    scoreBreakdown: { interest, budget, duration, season, preference },
    lesserKnown: destination.lesserKnown,
    sources: destination.sources,
    population,
    populationNote: population
      ? `Population ${population.toLocaleString()} from GeoNames city data.`
      : "Population is not in the city data for this match.",
  };
}

function seasonNote(destination: DestinationRecord): string {
  const months = destination.warmMonths
    .slice()
    .sort((a, b) => a - b)
    .map(monthName)
    .join(", ");
  return `Typically milder/warmer months in the catalog: ${months}. This is a seasonal tag, not a live forecast.`;
}

function budgetNote(destination: DestinationRecord): string {
  const label =
    destination.budgetTier === "lower"
      ? "lower relative cost"
      : destination.budgetTier === "higher"
        ? "higher relative cost"
        : "mid relative cost";
  return `${label} among Waypoint catalog destinations. Not a verified dollar estimate.`;
}

function monthName(month: number): string {
  return (
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][month - 1] ?? String(month)
  );
}

export function hardFilters(
  destination: DestinationRecord,
  filters: DiscoveryFilters,
): boolean {
  if (filters.region && destination.region !== filters.region) return false;
  if (filters.lesserKnownOnly && !destination.lesserKnown) return false;
  if (filters.international && filters.homeCountryCode) {
    if (destination.countryCode === filters.homeCountryCode) return false;
  }
  if (filters.similarTo) {
    const similar = filters.similarTo.toLowerCase().replace(/\s+/g, "-");
    const isSelf = destination.id === similar || destination.name.toLowerCase() === filters.similarTo.toLowerCase();
    if (isSelf) return false;
    const linked =
      destination.similarTo?.some(
        (id) => id.includes(similar) || similar.includes(id),
      ) ||
      destination.interests.some((interest) =>
        filters.interests.includes(interest),
      );
    if (!linked && filters.interests.length === 0) {
      // keep broadly related destinations when "similar to X" without extra interests
      const target = filters.similarTo;
      void target;
    }
  }
  return true;
}

export function rankDestinations(
  catalog: DestinationRecord[],
  filters: DiscoveryFilters,
  context: ScoreContext = {},
  limit = 12,
): DestinationRecommendation[] {
  return catalog
    .filter((destination) => hardFilters(destination, filters))
    .map((destination) => scoreDestination(destination, filters, context))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function compareDestinations(
  destinations: DestinationRecord[],
  criteria: CompareCriteria,
  context: ScoreContext = {},
) {
  const filters: DiscoveryFilters = {
    interests: criteria.interests,
    budgetMax: criteria.budgetMax,
    budgetTier: tierFromBudget(criteria.budgetMax),
    durationDays: criteria.durationDays,
    seasonMonth: criteria.seasonMonth,
  };
  return destinations.map((destination) => {
    const scored = scoreDestination(destination, filters, context);
    const advantages: string[] = [];
    const disadvantages = [...destination.disadvantages];
    if (scored.scoreBreakdown.interest >= 0.6) {
      advantages.push("Strong overlap with the interests you set for this comparison.");
    } else {
      disadvantages.push("Weaker overlap with the interests you set for this comparison.");
    }
    if (scored.scoreBreakdown.budget >= 0.6) {
      advantages.push("Relative catalog cost band fits the budget you entered.");
    } else if (criteria.budgetMax) {
      disadvantages.push(
        "Relative catalog cost band may sit above or below the budget you entered (estimate only).",
      );
    }
    if (scored.scoreBreakdown.duration >= 0.6) {
      advantages.push("Suggested stay length aligns with your available days.");
    }
    if (scored.scoreBreakdown.season >= 0.6 && criteria.seasonMonth) {
      advantages.push("Catalog seasonal tags align with the month you chose.");
    }
    return {
      destination: scored,
      advantages,
      disadvantages,
      suitabilityPercent: Math.round(scored.score * 100),
      suitabilityBreakdown: scored.scoreBreakdown,
      methodologyNote: SCORING_METHODOLOGY,
    };
  });
}

export { WEIGHTS };
