export type DiscoverRegion =
  | "europe"
  | "asia"
  | "north-america"
  | "latin-america"
  | "middle-east"
  | "africa"
  | "oceania";

export type BudgetTier = "lower" | "mid" | "higher";

export type DiscoverInterest =
  | "architecture"
  | "history"
  | "food"
  | "nature"
  | "aviation"
  | "beaches"
  | "culture"
  | "nightlife"
  | "museums"
  | "adventure"
  | "shopping";

export type Confidence = "catalog" | "estimate" | "verified" | "unknown";

export type DestinationRecord = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  region: DiscoverRegion;
  interests: DiscoverInterest[];
  /** Months 1–12 when the destination is typically warmer/milder. Catalog seasonal note only. */
  warmMonths: number[];
  budgetTier: BudgetTier;
  durationDays: { min: number; max: number };
  experiences: string[];
  attractions: string[];
  transitNote: string;
  disadvantages: string[];
  lesserKnown: boolean;
  similarTo?: string[];
  sources: string[];
};

export type DiscoveryFilters = {
  query?: string;
  interests: DiscoverInterest[];
  budgetMax?: number;
  budgetTier?: BudgetTier;
  durationDays?: number;
  region?: DiscoverRegion;
  seasonMonth?: number;
  climate?: "warm" | "cool" | "either";
  international?: boolean;
  similarTo?: string;
  lesserKnownOnly?: boolean;
  homeCountryCode?: string;
};

export type DestinationRecommendation = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  region: DiscoverRegion;
  photoUrl: string;
  why: string[];
  experiences: string[];
  attractions: string[];
  seasonsNote: string;
  seasonsConfidence: Confidence;
  durationNote: string;
  durationConfidence: Confidence;
  budgetNote: string;
  budgetConfidence: Confidence;
  transitNote: string;
  transitConfidence: Confidence;
  disadvantages: string[];
  score: number;
  scoreBreakdown: {
    interest: number;
    budget: number;
    duration: number;
    season: number;
    preference: number;
  };
  lesserKnown: boolean;
  sources: string[];
  population?: number | null;
  populationNote?: string;
};

export type DiscoverSectionId =
  | "recommended"
  | "by-interest"
  | "by-region"
  | "by-season"
  | "by-budget"
  | "similar"
  | "lesser-known"
  | "continue";

export type DiscoverSection = {
  id: DiscoverSectionId;
  title: string;
  description: string;
  destinations: DestinationRecommendation[];
};

export type CompareCriteria = {
  interests: DiscoverInterest[];
  budgetMax?: number;
  durationDays?: number;
  seasonMonth?: number;
  transport?: string;
};

export type DestinationComparison = {
  destination: DestinationRecommendation;
  advantages: string[];
  disadvantages: string[];
  suitabilityPercent: number;
  suitabilityBreakdown: DestinationRecommendation["scoreBreakdown"];
  methodologyNote: string;
};

export const SCORING_METHODOLOGY =
  "Suitability is a weighted blend of interest overlap (40%), relative budget-tier fit among catalog destinations (20%), suggested duration fit (15%), seasonal climate tags in the catalog (15%), and traveler/wishlist preference boosts (10%). Scores are comparative within this catalog, not verified market prices or weather forecasts.";
