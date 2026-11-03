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
  legs: {
    durationMinutes: number;
    distanceMeters: number;
    /** True when this leg came from a road/path router (not crow-flies). */
    routed?: boolean;
  }[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  polyline?: string;
  /** osrm/google = network path; estimate = straight-line fallback. */
  source?: "osrm" | "google" | "estimate";
}
