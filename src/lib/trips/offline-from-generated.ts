import type { GeneratedDay } from "@/lib/ai/generate-itinerary";
import type { ActivityRow, TripLeg, TripListItem } from "@/lib/types/trip";
import type { OfflineTripSnapshot } from "@/lib/offline/trips";

function clock(time: string): string {
  const trimmed = time.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = clock(time).split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`;
}

/** Turn a generated plan into a trip stored on this device. */
export function offlineSnapshotFromGenerated(input: {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: GeneratedDay[];
  legs?: TripLeg[];
  title?: string;
}): OfflineTripSnapshot {
  const days = input.days.map((day) => ({
    id: `${input.tripId}-day-${day.dayIndex}`,
    day_index: day.dayIndex,
  }));
  const activities: ActivityRow[] = input.days.flatMap((day) =>
    day.activities.map((act, sortOrder) => ({
      id: `${input.tripId}-act-${day.dayIndex}-${sortOrder}`,
      day_id: `${input.tripId}-day-${day.dayIndex}`,
      place_id: act.placeId || null,
      name: act.name,
      address: act.address ?? null,
      lat: act.lat,
      lng: act.lng,
      start_time: clock(act.startTime),
      end_time: addMinutes(act.startTime, act.durationMinutes),
      duration_minutes: act.durationMinutes,
      travel_minutes_from_prev: act.travelMinutesFromPrev ?? 0,
      priority: act.priority,
      planning_note: act.planningNote ?? null,
      hours_verified: act.hoursVerified,
      opening_hours: act.openingHours ?? null,
      website_uri: act.websiteUri ?? null,
      google_maps_uri: act.googleMapsUri ?? null,
      photo_name: act.photoName ?? null,
      popularity_label: act.popularityLabel ?? null,
      popularity_sources: act.popularitySources ?? null,
      popularity_attribution_urls: act.popularityAttributionUrls ?? null,
      schedule_warnings: act.scheduleWarnings ?? null,
      sort_order: sortOrder,
      user_locked: false,
      completed: false,
      source: "ai",
    })),
  );
  const trip: TripListItem = {
    id: input.tripId,
    destination: input.destination,
    start_date: input.startDate,
    end_date: input.endDate,
    cover_image_url: null,
    created_at: new Date().toISOString(),
    day_count: days.length,
    title: input.title,
  };
  return {
    trip,
    days,
    activities,
    updatedAt: new Date().toISOString(),
    offlineOnly: true,
    legs: input.legs,
  };
}
