export type TrendDirection = "rising" | "stable" | "falling" | "unknown";

export type PopularityLabel =
  | "trending_recent_posts"
  | "frequently_featured"
  | "multiple_sources"
  | "gaining_attention"
  | null;

export interface RawMention {
  source: string;
  title: string;
  snippet: string;
  url: string;
  publishedAt: Date | null;
  engagementHint?: number;
  isSponsored?: boolean;
}

export interface PlaceMentionAggregate {
  normalizedName: string;
  destinationHint: string;
  mentions: RawMention[];
  sourceCount: number;
}

export interface PopularitySignals {
  placeId: string | null;
  displayName: string;
  score: number;
  confidence: number;
  trend: TrendDirection;
  label: PopularityLabel;
  sources: string[];
  attributionUrls: string[];
  retrievedAt: Date;
}

export interface RankedCandidate {
  placeId: string;
  displayName: string;
  types: string[];
  lat: number;
  lng: number;
  popularity: PopularitySignals | null;
  combinedRank: number;
  /** Multi-city tag — which stay this candidate belongs to. */
  city?: string;
}
