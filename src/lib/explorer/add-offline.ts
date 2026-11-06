import { loadOfflineTrip, saveOfflineTrip } from "@/lib/offline/trips";
import type { ActivityRow } from "@/lib/types/trip";
import type { ExplorerPlace } from "./types";

export function addPlaceToOfflineTrip(input: {
  tripId: string;
  dayIndex: number;
  startTime: string;
  place: ExplorerPlace;
}): { ok: true } | { error: string } {
  const snap = loadOfflineTrip(input.tripId);
  if (!snap) return { error: "That trip is not saved on this device." };
  const day = snap.days.find((item) => item.day_index === input.dayIndex);
  if (!day) return { error: "That day is not on the trip." };
  if (snap.activities.some((activity) => activity.day_id === day.id && activity.place_id === input.place.id)) {
    return { error: "That place is already on this day." };
  }
  const [hour, minute] = input.startTime.split(":").map(Number);
  const endTotal = hour * 60 + minute + 90;
  const end = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:00`;
  const row: ActivityRow = {
    id: crypto.randomUUID(),
    day_id: day.id,
    place_id: input.place.id,
    name: input.place.name,
    address: input.place.address,
    lat: input.place.lat,
    lng: input.place.lng,
    start_time: `${input.startTime}:00`,
    end_time: end,
    duration_minutes: 90,
    travel_minutes_from_prev: null,
    priority: "optional",
    planning_note: input.place.why || null,
    hours_verified: Boolean(input.place.hours),
    opening_hours: input.place.hours ? { text: input.place.hours } : null,
    website_uri: null,
    google_maps_uri: input.place.mapsUrl,
    photo_name: input.place.photoName,
    popularity_label: null,
    popularity_sources: null,
    popularity_attribution_urls: null,
    schedule_warnings: null,
    sort_order: snap.activities.filter((activity) => activity.day_id === day.id).length,
    user_locked: true,
    completed: false,
    source: "explorer",
  };
  saveOfflineTrip({ ...snap, activities: [...snap.activities, row] });
  return { ok: true };
}
