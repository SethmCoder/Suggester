import { addMinutes } from "@/lib/ai/scheduler";
import type { ActivityRow, TripLeg } from "@/lib/types/trip";
import { expandLegsToDays } from "@/lib/trips/legs";

/** Clearly labeled sample itinerary — not live Google/Groq data. */
export const DEMO_TRIP_ID = "demo-paris";
/** Bump when demo payloads change so stale localStorage copies are ignored. */
export const DEMO_CONTENT_VERSION = 7;

export const DEMO_BANNER =
  "You’re exploring a sample trip. Plan your own from Plan a trip — it stays on this device.";

export const demoTrip = {
  id: DEMO_TRIP_ID,
  destination: "Paris, France",
  start_date: "2026-06-01",
  end_date: "2026-06-04",
  cover_image_url: null as string | null,
  created_at: new Date().toISOString(),
  status: "ready",
  day_count: 4,
};

export const demoParisLegs: TripLeg[] = [
  {
    city: "Paris",
    days: 4,
    hotel: "Hotel des Grands Boulevards",
    hotelAddress: "17 Boulevard Poissonniere, 75002 Paris",
    lat: 48.8712,
    lng: 2.3445,
    hotelLat: 48.8712,
    hotelLng: 2.3445,
    countryCode: "FR",
    country: "France",
    hotelBooked: false,
  },
];

export const demoDays = [
  { id: "demo-day-0", day_index: 0 },
  { id: "demo-day-1", day_index: 1 },
  { id: "demo-day-2", day_index: 2 },
  { id: "demo-day-3", day_index: 3 },
];

function endFrom(start: string, durationMinutes: number): string {
  return `${addMinutes(start.slice(0, 5), durationMinutes)}:00`;
}

function act(
  partial: Partial<ActivityRow> &
    Pick<ActivityRow, "id" | "day_id" | "name" | "sort_order"> & {
      start_time: string;
      duration_minutes: number;
    },
): ActivityRow {
  const start = partial.start_time.includes(":")
    ? partial.start_time.length === 5
      ? `${partial.start_time}:00`
      : partial.start_time
    : partial.start_time;
  const duration = partial.duration_minutes;
  return {
    place_id: null,
    address: null,
    lat: null,
    lng: null,
    travel_minutes_from_prev: 0,
    priority: "preferred",
    planning_note: null,
    hours_verified: false,
    opening_hours: null,
    website_uri: null,
    google_maps_uri: null,
    photo_name: null,
    popularity_label: null,
    popularity_sources: null,
    popularity_attribution_urls: null,
    schedule_warnings: null,
    user_locked: false,
    completed: false,
    source: "demo",
    ...partial,
    start_time: start,
    end_time: partial.end_time ?? endFrom(start, duration),
    duration_minutes: duration,
  };
}

/** Day 1 Historic → Day 2 Art → Day 3 Montmartre → Day 4 Eiffel / Seine. */
export const demoActivities: ActivityRow[] = [
  // —— Day 1 · Historic Paris ——
  act({
    id: "demo-a1",
    day_id: "demo-day-0",
    name: "Notre-Dame Cathedral",
    address: "Parvis Notre-Dame – Place Jean-Paul II, 75004 Paris",
    lat: 48.853,
    lng: 2.3499,
    start_time: "09:30:00",
    duration_minutes: 90,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Frequently featured by travelers",
    popularity_sources: ["demo_sample"],
    planning_note: "Start on the island — allow time for security lines.",
  }),
  act({
    id: "demo-a2",
    day_id: "demo-day-0",
    name: "Île de la Cité & Latin Quarter",
    address: "Île de la Cité → Place Saint-Michel, Paris",
    lat: 48.8506,
    lng: 2.3447,
    start_time: "11:15:00",
    duration_minutes: 105,
    travel_minutes_from_prev: 10,
    sort_order: 1,
    priority: "must_see",
    planning_note: "Cross to the Left Bank via Petit Pont / Saint-Michel.",
  }),
  act({
    id: "demo-a3",
    day_id: "demo-day-0",
    name: "Seine River walk",
    address: "Quai de la Tournelle, 75005 Paris",
    lat: 48.8499,
    lng: 2.3545,
    start_time: "14:00:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 15,
    sort_order: 2,
    priority: "preferred",
    planning_note: "Afternoon stroll along the quays after lunch.",
  }),
  act({
    id: "demo-a4",
    day_id: "demo-day-0",
    name: "Dinner · traditional French bistro",
    address: "Near Boulevard Saint-Germain, 75006 Paris",
    lat: 48.853,
    lng: 2.3386,
    start_time: "19:00:00",
    duration_minutes: 120,
    travel_minutes_from_prev: 20,
    sort_order: 3,
    priority: "preferred",
    planning_note: "Classic Left Bank dinner — book ahead on busy nights.",
  }),

  // —— Day 2 · Art and Landmarks ——
  act({
    id: "demo-a5",
    day_id: "demo-day-1",
    name: "Louvre Museum",
    address: "Rue de Rivoli, 75001 Paris",
    lat: 48.8606,
    lng: 2.3376,
    start_time: "09:00:00",
    duration_minutes: 210,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Frequently featured by travelers",
    popularity_sources: ["demo_sample"],
    planning_note: "Plan 3–4 hours. Timed-entry tickets help skip the longest lines.",
  }),
  act({
    id: "demo-a6",
    day_id: "demo-day-1",
    name: "Tuileries Garden",
    address: "Jardin des Tuileries, 75001 Paris",
    lat: 48.8634,
    lng: 2.3275,
    start_time: "12:45:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 10,
    sort_order: 1,
    priority: "preferred",
    planning_note: "Easy decompress after the museum — cafés nearby.",
  }),
  act({
    id: "demo-a7",
    day_id: "demo-day-1",
    name: "Champs-Élysées walk",
    address: "Avenue des Champs-Élysées, 75008 Paris",
    lat: 48.8698,
    lng: 2.3078,
    start_time: "14:30:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 25,
    sort_order: 2,
    priority: "preferred",
  }),
  act({
    id: "demo-a8",
    day_id: "demo-day-1",
    name: "Arc de Triomphe",
    address: "Place Charles de Gaulle, 75008 Paris",
    lat: 48.8738,
    lng: 2.295,
    start_time: "16:15:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 15,
    sort_order: 3,
    priority: "must_see",
    popularity_label: "Online interest increasing",
    popularity_sources: ["wikimedia_pageviews"],
    popularity_attribution_urls: [
      "https://en.wikipedia.org/wiki/Arc_de_Triomphe",
    ],
  }),

  // —— Day 3 · Montmartre ——
  act({
    id: "demo-a9",
    day_id: "demo-day-2",
    name: "Montmartre historic streets",
    address: "Rue des Abbesses / Rue Lepic, 75018 Paris",
    lat: 48.8842,
    lng: 2.3387,
    start_time: "10:00:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "must_see",
    planning_note: "Wander uphill through Abbesses before the basilica crowds.",
  }),
  act({
    id: "demo-a10",
    day_id: "demo-day-2",
    name: "Sacré-Cœur Basilica",
    address: "35 Rue du Chevalier de la Barre, 75018 Paris",
    lat: 48.8867,
    lng: 2.3431,
    start_time: "12:15:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 12,
    sort_order: 1,
    priority: "must_see",
    popularity_label: "Frequently featured by travelers",
    popularity_sources: ["demo_sample"],
  }),
  act({
    id: "demo-a11",
    day_id: "demo-day-2",
    name: "Art galleries & cafés",
    address: "Place du Tertre, 75018 Paris",
    lat: 48.8864,
    lng: 2.3408,
    start_time: "14:00:00",
    duration_minutes: 150,
    travel_minutes_from_prev: 8,
    sort_order: 2,
    priority: "preferred",
    planning_note: "Browse studio streets and linger over coffee.",
  }),
  act({
    id: "demo-a12",
    day_id: "demo-day-2",
    name: "Dinner in Montmartre",
    address: "Rue des Trois Frères, 75018 Paris",
    lat: 48.8845,
    lng: 2.339,
    start_time: "19:00:00",
    duration_minutes: 120,
    travel_minutes_from_prev: 10,
    sort_order: 3,
    priority: "preferred",
  }),

  // —— Day 4 · Eiffel Tower and Seine ——
  act({
    id: "demo-a13",
    day_id: "demo-day-3",
    name: "Trocadéro viewpoint",
    address: "Place du Trocadéro, 75016 Paris",
    lat: 48.8629,
    lng: 2.2875,
    start_time: "10:00:00",
    duration_minutes: 60,
    sort_order: 0,
    priority: "must_see",
    planning_note: "Best classic Eiffel Tower photo angle.",
  }),
  act({
    id: "demo-a14",
    day_id: "demo-day-3",
    name: "Eiffel Tower",
    address: "Champ de Mars, 5 Avenue Anatole France, 75007 Paris",
    lat: 48.8584,
    lng: 2.2945,
    start_time: "11:30:00",
    duration_minutes: 120,
    travel_minutes_from_prev: 20,
    sort_order: 1,
    priority: "must_see",
    popularity_label: "Online interest increasing",
    popularity_sources: ["wikimedia_pageviews"],
    popularity_attribution_urls: [
      "https://en.wikipedia.org/wiki/Eiffel_Tower",
    ],
    planning_note: "Summit or second floor — reserve tickets when possible.",
  }),
  act({
    id: "demo-a15",
    day_id: "demo-day-3",
    name: "Champ de Mars",
    address: "Parc du Champ de Mars, 75007 Paris",
    lat: 48.8565,
    lng: 2.298,
    start_time: "14:00:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 10,
    sort_order: 2,
    priority: "preferred",
    planning_note: "Picnic lawns around the tower base.",
  }),
  act({
    id: "demo-a16",
    day_id: "demo-day-3",
    name: "Evening Seine River cruise",
    address: "Port de la Bourdonnais / Pont de l'Alma, 75007 Paris",
    lat: 48.8635,
    lng: 2.3018,
    start_time: "19:00:00",
    duration_minutes: 120,
    travel_minutes_from_prev: 25,
    sort_order: 3,
    priority: "must_see",
    planning_note: "Sunset / lights cruise — confirm boarding quay on your ticket.",
  }),
];

export function isDemoTripId(id: string): boolean {
  return id === DEMO_TRIP_ID;
}

export function listDemoTrips() {
  return [demoTrip];
}

export function getDemoTripPayload(id: string = DEMO_TRIP_ID) {
  void id;
  return {
    trip: { ...demoTrip, day_count: demoDays.length },
    days: demoDays,
    activities: demoActivities,
    legs: demoParisLegs,
    dayCities: expandLegsToDays(demoParisLegs),
    contentVersion: DEMO_CONTENT_VERSION,
    preferences: {
      interests: ["architecture", "museums", "food"],
      intensity: "balanced" as const,
      transport: "walking",
      prefersHiddenGems: false,
      legs: demoParisLegs,
      hotel: demoParisLegs[0]?.hotel,
    },
    isDemo: true as const,
  };
}
