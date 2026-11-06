import type { GeneratedDay } from "@/lib/ai/generate-itinerary";
import type { TripPreferencesPayload } from "@/lib/types/trip";
import { createServiceClient } from "@/lib/supabase/server";

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export async function saveGeneratedItinerary(input: {
  tripId: string;
  days: GeneratedDay[];
  warnings?: string[];
}) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");

  await supabase.from("itinerary_days").delete().eq("trip_id", input.tripId);

  for (const day of input.days) {
    const { data: dayRow, error: dayErr } = await supabase
      .from("itinerary_days")
      .insert({ trip_id: input.tripId, day_index: day.dayIndex })
      .select("id")
      .single();
    if (dayErr || !dayRow) throw dayErr ?? new Error("day insert failed");

    const activities = day.activities.map((act, sort_order) => ({
      day_id: dayRow.id,
      place_id: act.placeId,
      name: act.name,
      address: act.address ?? null,
      lat: act.lat,
      lng: act.lng,
      start_time: act.startTime,
      end_time: addMinutesToTime(act.startTime, act.durationMinutes),
      duration_minutes: act.durationMinutes,
      travel_minutes_from_prev: act.travelMinutesFromPrev ?? 0,
      priority: act.priority,
      planning_note: act.planningNote ?? null,
      hours_verified: act.hoursVerified,
      opening_hours:
        typeof act.openingHours === "string" ? act.openingHours : null,
      website_uri: act.websiteUri ?? null,
      google_maps_uri: act.googleMapsUri ?? null,
      popularity_label: act.popularityLabel ?? null,
      popularity_sources: act.popularitySources ?? null,
      popularity_attribution_urls: act.popularityAttributionUrls ?? null,
      schedule_warnings: act.scheduleWarnings ?? null,
      sort_order,
      source: "ai",
    }));

    const { error: actErr } = await supabase.from("activities").insert(activities);
    if (actErr) throw actErr;
  }

  await supabase
    .from("trips")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", input.tripId);
}

export async function createTripRecord(input: {
  ownerId: string;
  destination: string;
  startDate: string;
  endDate: string;
  preferences: TripPreferencesPayload;
  priorities: {
    mustSee: string[];
    preferred: string[];
    optional: string[];
    avoid: string[];
    idealTrip: string;
  };
  idempotencyKey?: string;
}) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");

  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      owner_id: input.ownerId,
      destination: input.destination,
      start_date: input.startDate,
      end_date: input.endDate,
      status: "generating",
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (error || !trip) throw error ?? new Error("trip create failed");

  await supabase.from("trip_preferences").insert({
    trip_id: trip.id,
    payload: input.preferences,
  });

  await supabase.from("trip_priorities").insert({
    trip_id: trip.id,
    must_see: input.priorities.mustSee,
    preferred: input.priorities.preferred,
    optional: input.priorities.optional,
    avoid: input.priorities.avoid,
    ideal_trip: input.priorities.idealTrip,
  });

  return trip.id;
}

export async function fetchTripFull(tripId: string, userId: string) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");

  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!trip) return null;

  const { data: days } = await supabase
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", tripId)
    .order("day_index");

  const dayIds = days?.map((d) => d.id) ?? [];
  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .in("day_id", dayIds.length ? dayIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order");

  const { data: prefs } = await supabase
    .from("trip_preferences")
    .select("payload")
    .eq("trip_id", tripId)
    .maybeSingle();

  return { trip, days: days ?? [], activities: activities ?? [], preferences: prefs?.payload };
}
