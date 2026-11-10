import { DESTINATION_CATALOG } from "./catalog";
import { rankDestinations, tierFromBudget } from "./score";
import type {
  DiscoverInterest,
  DiscoverSection,
  DiscoveryFilters,
} from "./types";

type Context = {
  savedNames?: string[];
  dream?: string;
  previousDestinations?: string[];
  interests?: string[];
  downrankedInterests?: string[];
  preferredDestinations?: string[];
  /** Catalog ids shortlisted for this query (AI or heuristics). */
  shortlistIds?: string[];
};

const ALLOWED_INTERESTS = new Set<DiscoverInterest>([
  "architecture",
  "history",
  "food",
  "nature",
  "aviation",
  "beaches",
  "culture",
  "nightlife",
  "museums",
  "adventure",
  "shopping",
]);

function cleanInterests(values: string[] | undefined): DiscoverInterest[] {
  return [
    ...new Set(
      (values ?? []).filter((value): value is DiscoverInterest =>
        ALLOWED_INTERESTS.has(value as DiscoverInterest),
      ),
    ),
  ];
}

/**
 * One answer list for the Discover question — no duplicate browse sections.
 */
export function buildDiscoverSections(
  filters: DiscoveryFilters,
  context: Context = {},
): { sections: DiscoverSection[]; filters: DiscoveryFilters; notice: string } {
  const interests = cleanInterests([
    ...filters.interests,
    ...(context.interests ?? []),
  ]);
  const effective: DiscoveryFilters = {
    ...filters,
    interests,
    budgetTier: filters.budgetTier ?? tierFromBudget(filters.budgetMax),
    shortlistIds: filters.shortlistIds?.length
      ? filters.shortlistIds
      : context.shortlistIds,
  };

  const recommended = rankDestinations(DESTINATION_CATALOG, effective, context, 8);

  const title = effective.query?.trim()
    ? "Best matches for your question"
    : "Recommended for you";
  const description = effective.query?.trim()
    ? `Answer for “${effective.query.trim()}” — ranked from the destination catalog using your interests and trip constraints.`
    : "Ranked from your interests, budget, season tags, duration, and saved places.";

  return {
    sections: [
      {
        id: "recommended",
        title,
        description,
        destinations: recommended,
      },
    ],
    filters: effective,
    notice:
      "One ranked list from Waypoint’s destination catalog (not a generic popularity chart). Seasonal notes and cost bands are catalog estimates.",
  };
}
