export interface InboundFlightPrefs {
  fromIata: string;
  toIata: string;
  fromName?: string;
  toName?: string;
  distanceKm?: number;
  durationMinutes?: number;
  assumedDepartureLocal?: string;
  estimatedArrivalLocal?: string;
  arrivalDayOffset?: number;
  suggestedDayStart?: string;
  routeKnown?: boolean;
  note?: string;
}

/** How the traveler reaches this city from the previous city's hotel. */
export type LegTransitMode =
  | "auto"
  | "flight"
  | "major_train"
  | "regional_rail"
  | "coach"
  | "ferry"
  | "car";

/** One stay segment in a (possibly multi-city) trip. */
export interface TripLeg {
  city: string;
  /** Number of itinerary days based in this city. */
  days: number;
  /** Hotel name or address — activities are planned near this point when geocoded. */
  hotel?: string;
  geonameId?: number;
  lat?: number;
  lng?: number;
  countryCode?: string;
  hotelLat?: number;
  hotelLng?: number;
  hotelPlaceId?: string;
  hotelAddress?: string;
  /**
   * Transport from the previous city's hotel → this city's hotel.
   * Ignored on the first leg. "auto" lets the planner choose.
   */
  transitFromPrevious?: LegTransitMode;
}

export interface TripPreferencesPayload {
  destinations: { name: string; nights?: number }[];
  /** Ordered multi-city stays (Paris → Toulouse → Paris). */
  legs?: TripLeg[];
  departureCity?: string;
  /** Origin airport IATA (e.g. SEA). */
  originAirport?: string;
  /** Destination airport IATA (e.g. HND). */
  destinationAirport?: string;
  /** Estimated inbound flight from OpenFlights (no live schedule API). */
  inboundFlight?: InboundFlightPrefs;
  travelers?: number;
  budget?: number;
  currency?: string;
  interests: string[];
  intensity: "relaxed" | "balanced" | "packed";
  transport: string;
  hotel?: string;
  dietary?: string;
  accessibility?: string;
  dayStart?: string;
  dayEnd?: string;
  prefersHiddenGems?: boolean;
  idealTrip?: string;
}

export interface ActivityRow {
  id: string;
  day_id: string;
  place_id: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  travel_minutes_from_prev: number | null;
  priority: string | null;
  planning_note: string | null;
  hours_verified: boolean;
  opening_hours: unknown;
  website_uri: string | null;
  google_maps_uri: string | null;
  photo_name: string | null;
  popularity_label: string | null;
  popularity_sources: string[] | null;
  popularity_attribution_urls: string[] | null;
  schedule_warnings: string[] | null;
  sort_order: number;
  user_locked: boolean;
  completed: boolean;
  source: string;
}

export interface TripListItem {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  cover_image_url: string | null;
  created_at: string;
  day_count?: number;
}
