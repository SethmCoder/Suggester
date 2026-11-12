import type { GeneratedActivity, GeneratedDay } from "@/lib/ai/generate-itinerary";
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

function startTimeSortKey(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type LockedActivityRow = {
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
  popularity_label: string | null;
  popularity_sources: string[] | null;
  popularity_attribution_urls: string[] | null;
  schedule_warnings: string[] | null;
  source: string;
  sort_order: number;
};

function lockedRowToGenerated(row: LockedActivityRow): GeneratedActivity {
  const start =
    row.start_time?.slice(0, 5) && /^\d{2}:\d{2}$/.test(row.start_time.slice(0, 5))
      ? row.start_time.slice(0, 5)
      : "09:00";
  return {
    placeId: row.place_id?.trim() || `user-locked:${row.name}`,
    name: row.name,
    address: row.address ?? undefined,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    startTime: start,
    durationMinutes: row.duration_minutes ?? 60,
    priority: (row.priority as GeneratedActivity["priority"]) ?? "must_see",
    planningNote: row.planning_note ?? undefined,
    hoursVerified: Boolean(row.hours_verified),
    websiteUri: row.website_uri ?? undefined,
    googleMapsUri: row.google_maps_uri ?? undefined,
    popularityLabel: row.popularity_label,
    popularitySources: row.popularity_sources ?? undefined,
    popularityAttributionUrls: row.popularity_attribution_urls ?? undefined,
    scheduleWarnings: row.schedule_warnings ?? undefined,
    travelMinutesFromPrev: row.travel_minutes_from_prev ?? 0,
    openingHours: row.opening_hours ?? undefined,
  };
}

function mergeLockedIntoGeneratedDays(
  days: GeneratedDay[],
  lockedByDayIndex: Map<number, LockedActivityRow[]>,
): GeneratedDay[] {
  if (!lockedByDayIndex.size) return days;
  return days.map((day) => {
    const locked = lockedByDayIndex.get(day.dayIndex);
    if (!locked?.length) return day;
    const lockedActs = locked.map(lockedRowToGenerated);
    const lockedIds = new Set(
      locked
        .map((row) => row.place_id?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    const aiActs = day.activities.filter((act) => {
      const pid = act.placeId?.trim();
      return !pid || !lockedIds.has(pid);
    });
    const activities = [...lockedActs, ...aiActs].sort(
      (a, b) => startTimeSortKey(a.startTime) - startTimeSortKey(b.startTime),
    );
    return { ...day, activities };
  });
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

  const lockedByDayIndex = new Map<number, LockedActivityRow[]>();
  const { data: existingDays } = await supabase
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", input.tripId);

  const dayIds = existingDays?.map((d) => d.id) ?? [];
  if (dayIds.length) {
    const dayIndexById = new Map(
      (existingDays ?? []).map((d) => [d.id, d.day_index] as const),
    );
    const { data: lockedRows } = await supabase
      .from("activities")
      .select(
        "day_id, place_id, name, address, lat, lng, start_time, end_time, duration_minutes, travel_minutes_from_prev, priority, planning_note, hours_verified, opening_hours, website_uri, google_maps_uri, popularity_label, popularity_sources, popularity_attribution_urls, schedule_warnings, source, sort_order",
      )
      .in("day_id", dayIds)
      .eq("user_locked", true);

    for (const row of lockedRows ?? []) {
      const dayIndex = dayIndexById.get(row.day_id);
      if (dayIndex == null) continue;
      const list = lockedByDayIndex.get(dayIndex) ?? [];
      list.push(row as LockedActivityRow);
      lockedByDayIndex.set(dayIndex, list);
    }
    for (const [dayIndex, list] of lockedByDayIndex) {
      list.sort((a, b) => a.sort_order - b.sort_order);
      lockedByDayIndex.set(dayIndex, list);
    }
  }

  const lockedMetaByPlaceDay = new Map<string, { source: string }>();
  for (const [dayIndex, rows] of lockedByDayIndex) {
    for (const row of rows) {
      const key = `${dayIndex}:${row.place_id?.trim() || row.name}`;
      lockedMetaByPlaceDay.set(key, { source: row.source || "user" });
    }
  }

  const daysToSave = mergeLockedIntoGeneratedDays(input.days, lockedByDayIndex);

  await supabase.from("itinerary_days").delete().eq("trip_id", input.tripId);

  for (const day of daysToSave) {
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
      if (place_id && !place_id.startsWith("user-locked:")) {
        if (seenPlaceIds.has(place_id)) place_id = null;
        else seenPlaceIds.add(place_id);
      }
      const lockKey = `${day.dayIndex}:${
        rawId && !rawId.startsWith("user-locked:") ? rawId : act.name
      }`;
      const lockedMeta = lockedMetaByPlaceDay.get(lockKey);
      const wasLocked = Boolean(lockedMeta);
      return {
        day_id: dayRow.id,
        place_id: place_id?.startsWith("user-locked:") ? null : place_id,
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
        source: wasLocked ? lockedMeta!.source : "ai",
        user_locked: wasLocked,
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
