import type { GeneratedDay } from "@/lib/ai/generate-itinerary";
import type { TripPreferencesPayload } from "@/lib/types/trip";
import { createServiceClient } from "@/lib/supabase/server";

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`;
}

function asClock(time: string): string {
  const trimmed = time.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

/** Supabase Postgrest errors are plain objects — normalize to Error. */
export function dbError(err: unknown, fallback = "Database request failed"): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const row = err as { message?: unknown; details?: unknown; code?: unknown };
    const message =
      typeof row.message === "string" && row.message.trim()
        ? row.message.trim()
        : fallback;
    const details =
      typeof row.details === "string" && row.details.trim()
        ? ` (${row.details.trim()})`
        : "";
    const code =
      typeof row.code === "string" && row.code.trim()
        ? ` [${row.code.trim()}]`
        : "";
    return new Error(`${message}${details}${code}`);
  }
  return new Error(fallback);
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
    if (dayErr || !dayRow) {
      throw dbError(dayErr, "Could not save an itinerary day");
    }

    // activities_day_place_uq rejects duplicate non-null place_id on one day.
    // Keep every stop; clear repeated IDs so the day still saves.
    const seenPlaceIds = new Set<string>();
    const activities = day.activities.map((act, sort_order) => {
      const rawId = act.placeId?.trim() || null;
      let place_id = rawId;
      if (place_id) {
        if (seenPlaceIds.has(place_id)) place_id = null;
        else seenPlaceIds.add(place_id);
      }
      return {
        day_id: dayRow.id,
        place_id,
        name: act.name,
        address: act.address ?? null,
        lat: act.lat,
        lng: act.lng,
        start_time: asClock(act.startTime),
        end_time: addMinutesToTime(act.startTime, act.durationMinutes),
        duration_minutes: act.durationMinutes,
        travel_minutes_from_prev: act.travelMinutesFromPrev ?? 0,
        priority: act.priority,
        planning_note: act.planningNote ?? null,
        hours_verified: Boolean(act.hoursVerified),
        // Column is jsonb — wrap plain text so PostgREST accepts it.
        opening_hours:
          typeof act.openingHours === "string"
            ? { text: act.openingHours }
            : act.openingHours && typeof act.openingHours === "object"
              ? act.openingHours
              : null,
        website_uri: act.websiteUri ?? null,
        google_maps_uri: act.googleMapsUri ?? null,
        popularity_label: act.popularityLabel ?? null,
        popularity_sources: act.popularitySources ?? null,
        popularity_attribution_urls: act.popularityAttributionUrls ?? null,
        schedule_warnings: act.scheduleWarnings ?? null,
        sort_order,
        source: "ai",
      };
    });

    // PostgREST rejects insert([]) — empty days are still valid itinerary rows.
    if (activities.length) {
      const { error: actErr } = await supabase
        .from("activities")
        .insert(activities);
      if (actErr) throw dbError(actErr, "Could not save itinerary stops");
    }
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
}): Promise<{ tripId: string; reused: boolean }> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");

  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("trips")
      .select("id")
      .eq("owner_id", input.ownerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing?.id) {
      return { tripId: existing.id, reused: true };
    }
  }

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

  if (error) {
    // Unique race on idempotency_key — return the winner.
    if (input.idempotencyKey && (error as { code?: string }).code === "23505") {
      const { data: raced } = await supabase
        .from("trips")
        .select("id")
        .eq("owner_id", input.ownerId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced?.id) return { tripId: raced.id, reused: true };
    }
    throw dbError(error, "Could not create trip");
  }
  if (!trip) throw new Error("Could not create trip");

  const { error: prefErr } = await supabase.from("trip_preferences").insert({
    trip_id: trip.id,
    payload: input.preferences,
  });
  if (prefErr) throw dbError(prefErr, "Could not save trip preferences");

  const { error: priorErr } = await supabase.from("trip_priorities").insert({
    trip_id: trip.id,
    must_see: input.priorities.mustSee,
    preferred: input.priorities.preferred,
    optional: input.priorities.optional,
    avoid: input.priorities.avoid,
    ideal_trip: input.priorities.idealTrip,
  });
  if (priorErr) throw dbError(priorErr, "Could not save trip priorities");

  return { tripId: trip.id, reused: false };
}

/** Empty day rows so the itinerary page can open before generation finishes. */
export async function createTripDayShells(tripId: string, dayCount: number) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");
  const count = Math.max(1, Math.min(60, Math.floor(dayCount)));

  const { data: existing } = await supabase
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", tripId)
    .order("day_index");
  if (existing?.length) return existing;

  const rows = Array.from({ length: count }, (_, day_index) => ({
    trip_id: tripId,
    day_index,
  }));
  const { data, error } = await supabase
    .from("itinerary_days")
    .insert(rows)
    .select("id, day_index");
  if (error) throw dbError(error, "Could not create itinerary days");
  return data ?? [];
}

export async function updateTripStatus(
  tripId: string,
  status: "generating" | "ready" | "failed",
) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");
  const { error } = await supabase
    .from("trips")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", tripId);
  if (error) throw dbError(error, "Could not update trip status");
}

export async function updateTripPreferences(
  tripId: string,
  ownerId: string,
  payload: TripPreferencesPayload,
) {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Database not configured");

  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!trip) throw new Error("Trip not found");

  const { error } = await supabase
    .from("trip_preferences")
    .upsert({ trip_id: tripId, payload }, { onConflict: "trip_id" });
  if (error) throw error;
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
