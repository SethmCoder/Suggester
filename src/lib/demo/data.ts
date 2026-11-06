import type { ActivityRow, TripLeg } from "@/lib/types/trip";
import { expandLegsToDays, type DayCityAssignment } from "@/lib/trips/legs";

/** Clearly labeled sample itineraries — not live Google/Groq data. */
export const DEMO_TRIP_ID = "demo-paris";
export const DEMO_DUBAI_ID = "demo-dubai";
/** Bump when demo payloads change so stale localStorage copies are ignored. */
export const DEMO_CONTENT_VERSION = 6;

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

/** Multi-city sample: Dubai stay, then Abu Dhabi — shows how legs become day cities. */
export const demoDubaiLegs: TripLeg[] = [
  {
    city: "Dubai",
    days: 3,
    hotel: "Dubai Marina",
    lat: 25.0805,
    lng: 55.1403,
    countryCode: "AE",
  },
  {
    city: "Abu Dhabi",
    days: 2,
    hotel: "Abu Dhabi Corniche",
    lat: 24.4764,
    lng: 54.3705,
    countryCode: "AE",
    transitFromPrevious: "coach",
  },
];

export const demoDubaiTrip = {
  id: DEMO_DUBAI_ID,
  destination: "Dubai → Abu Dhabi, UAE",
  start_date: "2026-11-10",
  end_date: "2026-11-14",
  cover_image_url: null as string | null,
  created_at: new Date().toISOString(),
  status: "ready",
  day_count: 5,
};

export const demoDays = [
  { id: "demo-day-0", day_index: 0 },
  { id: "demo-day-1", day_index: 1 },
  { id: "demo-day-2", day_index: 2 },
  { id: "demo-day-3", day_index: 3 },
];

function act(
  partial: Partial<ActivityRow> &
    Pick<ActivityRow, "id" | "day_id" | "name" | "sort_order">,
): ActivityRow {
  return {
    place_id: null,
    address: null,
    lat: null,
    lng: null,
    start_time: "10:00:00",
    end_time: "11:30:00",
    duration_minutes: 90,
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
  };
}

export const demoActivities: ActivityRow[] = [
  act({
    id: "demo-a1",
    day_id: "demo-day-0",
    name: "Île de la Cité stroll",
    address: "Île de la Cité, Paris",
    lat: 48.855,
    lng: 2.348,
    start_time: "10:00:00",
    duration_minutes: 90,
    sort_order: 0,
    priority: "must_see",
    planning_note: "Easy arrival-day walk near the river.",
  }),
  act({
    id: "demo-a2",
    day_id: "demo-day-0",
    name: "Lunch near Saint-Michel",
    address: "Place Saint-Michel, Paris",
    lat: 48.8534,
    lng: 2.3437,
    start_time: "12:30:00",
    duration_minutes: 75,
    travel_minutes_from_prev: 12,
    sort_order: 1,
    priority: "optional",
  }),
  act({
    id: "demo-a3",
    day_id: "demo-day-1",
    name: "Louvre Museum area",
    address: "Rue de Rivoli, Paris",
    lat: 48.8606,
    lng: 2.3376,
    start_time: "09:30:00",
    duration_minutes: 150,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Frequently featured by travelers",
    popularity_sources: ["demo_sample"],
    planning_note: "Book tickets ahead if you want timed entry.",
  }),
  act({
    id: "demo-a4",
    day_id: "demo-day-1",
    name: "Tuileries Garden break",
    address: "Jardin des Tuileries, Paris",
    lat: 48.8634,
    lng: 2.3275,
    start_time: "12:30:00",
    duration_minutes: 45,
    travel_minutes_from_prev: 8,
    sort_order: 1,
    priority: "preferred",
  }),
  act({
    id: "demo-a5",
    day_id: "demo-day-1",
    name: "Musée d'Orsay exterior walk",
    address: "1 Rue de la Légion d'Honneur, Paris",
    lat: 48.86,
    lng: 2.3266,
    start_time: "14:00:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 15,
    sort_order: 2,
    priority: "preferred",
  }),
  act({
    id: "demo-a6",
    day_id: "demo-day-2",
    name: "Eiffel Tower viewpoint",
    address: "Champ de Mars, Paris",
    lat: 48.8584,
    lng: 2.2945,
    start_time: "10:00:00",
    duration_minutes: 90,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Online interest increasing",
    popularity_sources: ["wikimedia_pageviews"],
    popularity_attribution_urls: [
      "https://en.wikipedia.org/wiki/Eiffel_Tower",
    ],
  }),
  act({
    id: "demo-a7",
    day_id: "demo-day-2",
    name: "Seine riverside walk",
    address: "Quai Branly, Paris",
    lat: 48.8606,
    lng: 2.297,
    start_time: "12:00:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 10,
    sort_order: 1,
    priority: "preferred",
  }),
  act({
    id: "demo-a8",
    day_id: "demo-day-2",
    name: "Trocadéro photos",
    address: "Place du Trocadéro, Paris",
    lat: 48.8629,
    lng: 2.2875,
    start_time: "14:00:00",
    duration_minutes: 45,
    travel_minutes_from_prev: 18,
    sort_order: 2,
    priority: "optional",
  }),
  act({
    id: "demo-a9",
    day_id: "demo-day-3",
    name: "Montmartre & Sacré-Cœur area",
    address: "Montmartre, Paris",
    lat: 48.8867,
    lng: 2.3431,
    start_time: "10:00:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "preferred",
  }),
  act({
    id: "demo-a10",
    day_id: "demo-day-3",
    name: "Departure buffer / café",
    address: "Near Gare du Nord area, Paris",
    lat: 48.8809,
    lng: 2.3553,
    start_time: "14:00:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 25,
    sort_order: 1,
    priority: "optional",
    planning_note: "Light departure-day block.",
  }),
];

export const demoDubaiDays = [
  { id: "demo-dxb-day-0", day_index: 0 },
  { id: "demo-dxb-day-1", day_index: 1 },
  { id: "demo-dxb-day-2", day_index: 2 },
  { id: "demo-dxb-day-3", day_index: 3 },
  { id: "demo-dxb-day-4", day_index: 4 },
];

export const demoDubaiDayCities: DayCityAssignment[] =
  expandLegsToDays(demoDubaiLegs);

export const demoDubaiActivities: ActivityRow[] = [
  // —— Dubai days 1–3 ——
  act({
    id: "demo-dxb-a1",
    day_id: "demo-dxb-day-0",
    name: "Dubai Marina waterfront walk",
    address: "Dubai Marina, Dubai",
    lat: 25.0805,
    lng: 55.1403,
    start_time: "16:00:00",
    duration_minutes: 90,
    sort_order: 0,
    priority: "must_see",
    planning_note: "Arrival-day stroll — cooler late afternoon.",
  }),
  act({
    id: "demo-dxb-a2",
    day_id: "demo-dxb-day-0",
    name: "JBR beach sunset",
    address: "Jumeirah Beach Residence, Dubai",
    lat: 25.0772,
    lng: 55.1335,
    start_time: "18:00:00",
    duration_minutes: 75,
    travel_minutes_from_prev: 15,
    sort_order: 1,
    priority: "preferred",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a3",
    day_id: "demo-dxb-day-1",
    name: "Burj Khalifa area & Downtown",
    address: "Downtown Dubai",
    lat: 25.1972,
    lng: 55.2744,
    start_time: "10:00:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Online interest increasing",
    popularity_sources: ["wikimedia_pageviews"],
    popularity_attribution_urls: [
      "https://en.wikipedia.org/wiki/Burj_Khalifa",
    ],
    planning_note:
      "Book the observation deck ahead if you want a timed visit.",
  }),
  act({
    id: "demo-dxb-a4",
    day_id: "demo-dxb-day-1",
    name: "Dubai Fountain boardwalk",
    address: "The Dubai Fountain, Dubai",
    lat: 25.1952,
    lng: 55.274,
    start_time: "13:00:00",
    duration_minutes: 45,
    travel_minutes_from_prev: 10,
    sort_order: 1,
    priority: "preferred",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a5",
    day_id: "demo-dxb-day-1",
    name: "Dubai Mall exterior / Souk Al Bahar",
    address: "Downtown Dubai",
    lat: 25.1985,
    lng: 55.2796,
    start_time: "15:00:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 8,
    sort_order: 2,
    priority: "optional",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a6",
    day_id: "demo-dxb-day-2",
    name: "Old Dubai — Al Fahidi / Creek",
    address: "Al Fahidi Historical Neighbourhood, Dubai",
    lat: 25.2631,
    lng: 55.2972,
    start_time: "09:30:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "must_see",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a7",
    day_id: "demo-dxb-day-2",
    name: "Abra crossing & spice souk stroll",
    address: "Dubai Creek, Dubai",
    lat: 25.265,
    lng: 55.296,
    start_time: "12:00:00",
    duration_minutes: 90,
    travel_minutes_from_prev: 12,
    sort_order: 1,
    priority: "preferred",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a8",
    day_id: "demo-dxb-day-2",
    name: "Gold Souk browse",
    address: "Deira Gold Souk, Dubai",
    lat: 25.2697,
    lng: 55.298,
    start_time: "14:30:00",
    duration_minutes: 60,
    travel_minutes_from_prev: 15,
    sort_order: 2,
    priority: "optional",
    planning_note: "Last Dubai day before the Abu Dhabi leg.",
  }),
  // —— Transit + Abu Dhabi days 4–5 ——
  act({
    id: "demo-dxb-a9",
    day_id: "demo-dxb-day-3",
    name: "Coach / bus · Marina area → Corniche area",
    address: "Dubai hotel → Abu Dhabi hotel · ~140 km · ~2h 0m",
    lat: 24.85,
    lng: 54.7,
    start_time: "08:45:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "must_see",
    place_id: "transit:coach:Dubai:Abu Dhabi",
    planning_note:
      "Coach from Dubai Marina to Abu Dhabi Corniche, about 140 km. Leave around 08:45 and arrive around 10:45. Check the timetable before you travel.",
    schedule_warnings: [
      "Transit times are planned windows, not live booked tickets.",
    ],
  }),
  act({
    id: "demo-dxb-a10",
    day_id: "demo-dxb-day-3",
    name: "Sheikh Zayed Grand Mosque exterior",
    address: "Sheikh Zayed Grand Mosque, Abu Dhabi",
    lat: 24.4128,
    lng: 54.475,
    start_time: "13:00:00",
    duration_minutes: 120,
    travel_minutes_from_prev: 40,
    sort_order: 1,
    priority: "must_see",
    planning_note:
      "First stop after the city change. Modest dress is required.",
  }),
  act({
    id: "demo-dxb-a11",
    day_id: "demo-dxb-day-3",
    name: "Corniche waterfront stroll",
    address: "Abu Dhabi Corniche",
    lat: 24.4764,
    lng: 54.3205,
    start_time: "16:30:00",
    duration_minutes: 75,
    travel_minutes_from_prev: 25,
    sort_order: 2,
    priority: "preferred",
    planning_note: null,
  }),
  act({
    id: "demo-dxb-a12",
    day_id: "demo-dxb-day-4",
    name: "Louvre Abu Dhabi area",
    address: "Saadiyat Island, Abu Dhabi",
    lat: 24.5337,
    lng: 54.398,
    start_time: "10:00:00",
    duration_minutes: 120,
    sort_order: 0,
    priority: "must_see",
    popularity_label: "Online interest increasing",
    popularity_sources: ["wikimedia_pageviews"],
    popularity_attribution_urls: [
      "https://en.wikipedia.org/wiki/Louvre_Abu_Dhabi",
    ],
    planning_note: "Last full day in Abu Dhabi.",
  }),
  act({
    id: "demo-dxb-a13",
    day_id: "demo-dxb-day-4",
    name: "Qasr Al Watan exterior / departure buffer",
    address: "Qasr Al Watan, Abu Dhabi",
    lat: 24.4647,
    lng: 54.3258,
    start_time: "14:00:00",
    duration_minutes: 75,
    travel_minutes_from_prev: 30,
    sort_order: 1,
    priority: "optional",
    planning_note: "Light end-of-trip block.",
  }),
];

export function isDemoTripId(id: string): boolean {
  return id === DEMO_TRIP_ID || id === DEMO_DUBAI_ID;
}

export function listDemoTrips() {
  return [demoTrip, demoDubaiTrip];
}

export function getDemoTripPayload(id: string = DEMO_TRIP_ID) {
  if (id === DEMO_DUBAI_ID) {
    return {
      trip: { ...demoDubaiTrip, day_count: demoDubaiDays.length },
      days: demoDubaiDays,
      activities: demoDubaiActivities,
      legs: demoDubaiLegs,
      dayCities: demoDubaiDayCities,
      contentVersion: DEMO_CONTENT_VERSION,
      preferences: {
        interests: ["architecture", "culture", "shopping"],
        intensity: "balanced",
        transport: "transit",
        prefersHiddenGems: false,
        legs: demoDubaiLegs,
      },
      isDemo: true as const,
    };
  }
  return {
    trip: { ...demoTrip, day_count: demoDays.length },
    days: demoDays,
    activities: demoActivities,
    legs: [
      {
        city: "Paris",
        days: 4,
        hotel: "Central Paris",
        lat: 48.86,
        lng: 2.35,
        countryCode: "FR",
      },
    ] satisfies TripLeg[],
    dayCities: expandLegsToDays([
      {
        city: "Paris",
        days: 4,
        hotel: "Central Paris",
        lat: 48.86,
        lng: 2.35,
        countryCode: "FR",
      },
    ]),
    contentVersion: DEMO_CONTENT_VERSION,
    preferences: {
      interests: ["architecture", "museums", "food"],
      intensity: "balanced",
      transport: "walking",
      prefersHiddenGems: false,
    },
    isDemo: true as const,
  };
}
