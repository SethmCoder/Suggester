import type { DiscoverInterest } from "@/lib/discover/types";

export type PreferenceSource = "explicit" | "inferred";

export type WeightedInterest = {
  interest: DiscoverInterest | string;
  weight: number;
  source: PreferenceSource;
  /** How many soft signals contributed. One click is not permanent. */
  evidence: number;
  updatedAt: string;
};

export type TravelIntelligence = {
  version: 1;
  personalizationEnabled: boolean;
  /** Explicit controls the traveler set in Profile. */
  explicit: {
    interests: string[];
    pace?: "relaxed" | "balanced" | "packed";
    transport?: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    preferredDurationDays?: number | null;
    destinationTypes: string[];
    preferredRegions: string[];
    favoriteExperiences: string[];
    avoidedExperiences: string[];
  };
  /** Soft signals from saves, dismissals, and trips. Decayed until evidence builds. */
  inferred: {
    interests: WeightedInterest[];
    preferredDestinations: string[];
    previousDestinations: string[];
    downrankedInterests: WeightedInterest[];
  };
  explanations: string[];
  updatedAt: string;
};

export type IntelligenceSignal =
  | { type: "wishlist_save"; category?: string | null; location?: string | null; name?: string }
  | { type: "wishlist_remove"; category?: string | null }
  | { type: "future_trip_create"; destination: string; interests?: string[] }
  | { type: "discover_save"; destinationId: string; interests?: string[] }
  | { type: "activity_keep"; name: string; types?: string[] }
  | { type: "activity_dismiss"; name: string; types?: string[] }
  /** Real confirmation paste/forward — stronger than a Discover click. */
  | {
      type: "booking_confirmation";
      kind: "flight" | "hotel" | "rail" | "restaurant" | "other";
      cities?: string[];
      cabin?: string | null;
      route?: string | null;
    }
  | { type: "explicit_set"; patch: Partial<TravelIntelligence["explicit"]> }
  | { type: "reset" }
  | { type: "toggle"; enabled: boolean };

export const INTELLIGENCE_STORAGE_KEY = "waypoint:travel-intelligence-v1";

export function emptyIntelligence(): TravelIntelligence {
  return {
    version: 1,
    personalizationEnabled: true,
    explicit: {
      interests: [],
      destinationTypes: [],
      preferredRegions: [],
      favoriteExperiences: [],
      avoidedExperiences: [],
    },
    inferred: {
      interests: [],
      preferredDestinations: [],
      previousDestinations: [],
      downrankedInterests: [],
    },
    explanations: [],
    updatedAt: new Date().toISOString(),
  };
}
