import { DESTINATION_CATALOG } from "./catalog";
import { rankDestinations, scoreDestination, tierFromBudget } from "./score";
import type {
  DiscoverSection,
  DiscoveryFilters,
  DestinationRecommendation,
} from "./types";

type Context = {
  savedNames?: string[];
  dream?: string;
  previousDestinations?: string[];
  interests?: string[];
  downrankedInterests?: string[];
  preferredDestinations?: string[];
};

function uniq(rows: DestinationRecommendation[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function buildDiscoverSections(
  filters: DiscoveryFilters,
  context: Context = {},
): { sections: DiscoverSection[]; filters: DiscoveryFilters; notice: string } {
  const interests = [
    ...new Set([
      ...filters.interests,
      ...((context.interests ?? []) as DiscoveryFilters["interests"]),
    ]),
  ];
  const effective: DiscoveryFilters = {
    ...filters,
    interests,
    budgetTier: filters.budgetTier ?? tierFromBudget(filters.budgetMax),
  };

  const recommended = rankDestinations(DESTINATION_CATALOG, effective, context, 8);

  const byInterest = interests.length
    ? rankDestinations(
        DESTINATION_CATALOG,
        { ...effective, region: undefined, similarTo: undefined },
        context,
        6,
      )
    : DESTINATION_CATALOG.filter((row) => row.interests.includes("architecture"))
        .slice(0, 6)
        .map((row) => scoreDestination(row, effective, context));

  const byRegion = effective.region
    ? rankDestinations(
        DESTINATION_CATALOG.filter((row) => row.region === effective.region),
        { ...effective, region: undefined },
        context,
        6,
      )
    : rankDestinations(
        DESTINATION_CATALOG,
        { ...effective, region: "europe" },
        context,
        6,
      );

  const bySeason = rankDestinations(
    DESTINATION_CATALOG,
    {
      ...effective,
      climate: effective.climate === "either" ? "warm" : effective.climate,
      seasonMonth: effective.seasonMonth ?? new Date().getUTCMonth() + 1,
    },
    context,
    6,
  );

  const byBudget = rankDestinations(
    DESTINATION_CATALOG,
    {
      ...effective,
      budgetTier: effective.budgetTier ?? "mid",
    },
    context,
    6,
  );

  const similarSeed =
    effective.similarTo ||
    context.previousDestinations?.[0] ||
    context.savedNames?.[0];
  const similar = similarSeed
    ? rankDestinations(
        DESTINATION_CATALOG,
        { ...effective, similarTo: similarSeed, lesserKnownOnly: true },
        context,
        6,
      )
    : rankDestinations(
        DESTINATION_CATALOG.filter((row) => row.lesserKnown),
        effective,
        context,
        6,
      );

  const lesserKnown = rankDestinations(
    DESTINATION_CATALOG.filter((row) => row.lesserKnown),
    { ...effective, lesserKnownOnly: true },
    context,
    6,
  );

  const continueExploring = uniq(
    [...recommended, ...lesserKnown, ...byInterest].slice(0, 8),
  );

  const sections: DiscoverSection[] = [
    {
      id: "recommended",
      title: "Recommended for you",
      description:
        "Ranked from your interests, budget, season tags, duration, and saved places. Not a popularity contest.",
      destinations: recommended,
    },
    {
      id: "by-interest",
      title: "Explore by interest",
      description: interests.length
        ? `Weighted toward ${interests.join(", ")}.`
        : "Architecture-led picks until you name more interests.",
      destinations: byInterest,
    },
    {
      id: "by-region",
      title: "Explore by region",
      description: effective.region
        ? `Focused on ${effective.region.replace(/-/g, " ")}.`
        : "A Europe sample when no region is set. Change the query to switch regions.",
      destinations: byRegion,
    },
    {
      id: "by-season",
      title: "Explore by season",
      description:
        "Uses catalog warm/mild month tags only. Not a live weather forecast.",
      destinations: bySeason,
    },
    {
      id: "by-budget",
      title: "Destinations within your budget",
      description:
        "Relative cost bands inside this catalog. Dollar prices are not verified here.",
      destinations: byBudget,
    },
    {
      id: "similar",
      title: "Similar to places you've enjoyed",
      description: similarSeed
        ? `Looking near the feel of ${similarSeed}, with quieter options preferred when possible.`
        : "Quieter catalog destinations until you save places or name a comparison city.",
      destinations: similar,
    },
    {
      id: "lesser-known",
      title: "Lesser-known destinations",
      description: "Catalog places marked as lesser-known relative to headline capitals.",
      destinations: lesserKnown,
    },
    {
      id: "continue",
      title: "Continue exploring",
      description: "More matches from the same ranked set.",
      destinations: continueExploring,
    },
  ];

  return {
    sections,
    filters: effective,
    notice:
      "Recommendations use a curated destination catalog plus GeoNames population when available. Seasonal notes and relative cost bands are estimates. Google Places is used only when a server key is configured elsewhere in Waypoint; it is not required for this page.",
  };
}
