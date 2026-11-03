export type MapsProviderId = "openstreetmap" | "google";

export interface PlaceHit {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  types: string[];
  formattedAddress?: string;
}

export interface PlaceDetails extends PlaceHit {
  regularOpeningHours?: unknown;
  websiteUri?: string;
  googleMapsUri?: string;
  photoName?: string;
  hoursVerified: boolean;
  userRatingCount?: number;
}

export interface DayRouteResult {
  legs: { durationMinutes: number; distanceMeters: number }[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  polyline?: string;
}
