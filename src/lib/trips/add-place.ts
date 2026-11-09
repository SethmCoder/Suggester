import type { ActivityRow } from "@/lib/types/trip";

/** Deduped activity insert for Things / Explorer — same place_id on same day is rejected. */
export function buildAddedActivity(input: {
  dayId: string;
  existing: ActivityRow[];
  placeId: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  startTime: string;
  city?: string;
}): { activity: ActivityRow } | { duplicate: true } {
  if (
    input.existing.some(
      (a) => a.day_id === input.dayId && a.place_id === input.placeId,
    )
  ) {
    return { duplicate: true };
  }
  const start = input.startTime.includes(":")
    ? input.startTime.length === 5
      ? `${input.startTime}:00`
      : input.startTime
    : `${input.startTime}:00`;
  const activity: ActivityRow = {
    id: crypto.randomUUID(),
    day_id: input.dayId,
    place_id: input.placeId,
    name: input.name,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    start_time: start,
    end_time: null,
    duration_minutes: 90,
    travel_minutes_from_prev: null,
    priority: "optional",
    planning_note: input.city ? `city=${input.city}` : null,
    hours_verified: false,
    opening_hours: null,
    website_uri: null,
    google_maps_uri: null,
    photo_name: null,
    popularity_label: null,
    popularity_sources: null,
    popularity_attribution_urls: null,
    schedule_warnings: null,
    sort_order: input.existing.filter((a) => a.day_id === input.dayId).length,
    user_locked: true,
    completed: false,
    source: "things",
  };
  return { activity };
}

export function applyDoneToggle(
  activity: Pick<ActivityRow, "completed">,
): { completed: boolean } {
  return { completed: !activity.completed };
}

export function removeFromItineraryOnly<T extends { id: string }>(
  activities: T[],
  activityId: string,
): T[] {
  return activities.filter((a) => a.id !== activityId);
}
