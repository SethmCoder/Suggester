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

export interface TripPreferencesPayload {
  destinations: { name: string; nights?: number }[];
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
