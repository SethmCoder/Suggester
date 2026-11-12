import type { DreamerBooking } from "@/lib/dreamer/types";
import {
  loadOfflineTrip,
  saveOfflineTrip,
} from "@/lib/offline/trips";
import type { ActivityRow } from "@/lib/types/trip";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function newActivityId() {
  return `act-${Math.random().toString(36).slice(2, 10)}`;
}

function baseActivity(
  dayId: string,
  sortOrder: number,
  fields: Partial<ActivityRow> & {
    place_id: string;
    name: string;
  },
): ActivityRow {
  return {
    id: newActivityId(),
    day_id: dayId,
    place_id: fields.place_id,
    name: fields.name,
    address: fields.address ?? null,
    lat: fields.lat ?? null,
    lng: fields.lng ?? null,
    start_time: fields.start_time ?? null,
    end_time: fields.end_time ?? null,
    duration_minutes: fields.duration_minutes ?? null,
    travel_minutes_from_prev: 0,
    priority: "must_see",
    planning_note: fields.planning_note ?? null,
    hours_verified: false,
    opening_hours: null,
    website_uri: null,
    google_maps_uri: null,
    photo_name: null,
    popularity_label: null,
    popularity_sources: null,
    popularity_attribution_urls: null,
    schedule_warnings: null,
    sort_order: sortOrder,
    user_locked: true,
    completed: false,
    source: "booking_paste",
  };
}

/**
 * Pin a pasted hotel / restaurant / flight confirmation onto an offline trip
 * calendar so forwarded evidence shows up without a full rebuild.
 */
export function applyBookingToOfflineTrip(
  tripId: string,
  booking: DreamerBooking,
): boolean {
  const snap = loadOfflineTrip(tripId);
  if (!snap?.trip) return false;

  const parsed = booking.parsed ?? {};
  const dayGroups = [...(snap.dayGroups ?? [])];
  if (!dayGroups.length) return false;

  const startDate = snap.trip.start_date;
  let dayIndex = 0;
  if (parsed.startDate && startDate) {
    const start = Date.parse(`${startDate}T12:00:00Z`);
    const target = Date.parse(`${parsed.startDate}T12:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(target)) {
      dayIndex = Math.max(
        0,
        Math.min(
          dayGroups.length - 1,
          Math.round((target - start) / 86_400_000),
        ),
      );
    }
  }

  const day = dayGroups[dayIndex];
  if (!day) return false;
  const activities: ActivityRow[] = [...(day.activities ?? [])];
  const lat = snap.legs?.[0]?.hotelLat ?? snap.legs?.[0]?.lat ?? null;
  const lng = snap.legs?.[0]?.hotelLng ?? snap.legs?.[0]?.lng ?? null;
  let changed = false;

  const push = (fields: Parameters<typeof baseActivity>[2]) => {
    if (activities.some((a) => a.place_id === fields.place_id)) return;
    activities.push(baseActivity(day.dayId, activities.length, fields));
    changed = true;
  };

  if (parsed.hotelName || booking.kind === "hotel") {
    const hotel = parsed.hotelName || booking.title;
    if (hotel && !/^confirmation|pasted booking$/i.test(hotel)) {
      const legs = [...(snap.legs ?? [])];
      if (legs[0]) {
        legs[0] = {
          ...legs[0],
          hotel,
          hotelBooked: true,
        };
        snap.legs = legs;
        changed = true;
      }
      push({
        place_id: `hotel:checkin:${slug(hotel)}`,
        name: `Check-in · ${hotel}`,
        address: legs[0]?.city || snap.trip.destination,
        lat,
        lng,
        start_time: "15:00",
        end_time: "15:45",
        duration_minutes: 45,
        planning_note: "From your hotel confirmation.",
      });
    }
  }

  if (parsed.restaurantName || booking.kind === "restaurant") {
    const name = parsed.restaurantName || booking.title;
    if (name && !/^confirmation|pasted booking$/i.test(name)) {
      const time = (parsed.reservationLocal || "19:00").slice(0, 5);
      push({
        place_id: `restaurant:booked:${slug(name)}`,
        name,
        address: parsed.cities?.[0] || snap.trip.destination,
        lat,
        lng,
        start_time: time,
        duration_minutes: 90,
        planning_note: "From your restaurant reservation.",
      });
    }
  }

  if ((parsed.fromIata && parsed.toIata) || booking.kind === "flight") {
    const to = parsed.toIata || "ARR";
    const from = parsed.fromIata || "DEP";
    const time = (parsed.arrivalLocal || "12:00").slice(0, 5);
    push({
      place_id: `flight:arrive:${to}`,
      name: `Arrive · ${to}`,
      address: `${from} → ${to}`,
      lat,
      lng,
      start_time: time,
      duration_minutes: 60,
      planning_note: "From your flight confirmation.",
    });
  }

  if (!changed) return false;

  dayGroups[dayIndex] = { ...day, activities };
  saveOfflineTrip({
    ...snap,
    dayGroups,
    legs: snap.legs,
  });
  return true;
}
