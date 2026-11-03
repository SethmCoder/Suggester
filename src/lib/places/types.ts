export type PlaceCategory =
  | "restaurant"
  | "cafe"
  | "hotel"
  | "museum"
  | "attraction"
  | "historic"
  | "park"
  | "beach"
  | "viewpoint"
  | "shopping"
  | "entertainment"
  | "other";

export interface DiscoveredPlace {
  placeId: string;
  name: string;
  category: PlaceCategory;
  address: string | null;
  lat: number;
  lng: number;
  osmId: string;
  tags: Record<string, string>;
  wikipediaTitle: string | null;
  wikidataId: string | null;
  source: "openstreetmap";
  retrievedAt: string;
}

export type OnlineInterestClass =
  | "increasing"
  | "stable"
  | "decreasing"
  | null;

export type InterestConfidence = "low" | "medium" | "high" | "none";

export interface OnlineInterestSignal {
  placeId: string;
  wikipediaTitle: string | null;
  classification: OnlineInterestClass;
  confidence: InterestConfidence;
  percentChange: number | null;
  recentViews: number | null;
  previousViews: number | null;
  label: string | null;
  source: "wikimedia_pageviews";
  retrievedAt: string;
}

export interface DestinationContext {
  handle: string | null;
  brief: string | null;
  weatherSummary: string | null;
  safetyNote: string | null;
  currency: string | null;
  source: "sorted_travel";
  retrievedAt: string;
}
