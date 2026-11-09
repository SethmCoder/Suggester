import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fitVisit } from "@/lib/ai/hours";
import { assistantPatchSchema } from "@/lib/ai/patch";
import {
  addMinutes,
  orderByRoutedNeighbor,
  shiftActivityStartTime,
} from "@/lib/ai/scheduler";
import { isDemoTripId } from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { getPlaceDetails } from "@/lib/maps";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const patch = assistantPatchSchema.parse(await req.json());
  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo && isDemoTripId(tripId)) {
    return NextResponse.json({ ok: true, mode: "demo", patch });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json(
      { error: "Database not configured (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 503 },
    );
  }

  const { data: trip } = await svc
    .from("trips")
    .select("id, start_date")
    .eq("id", tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: prefsRow } = await svc
    .from("trip_preferences")
    .select("payload")
    .eq("trip_id", tripId)
    .maybeSingle();
  const transport =
    typeof prefsRow?.payload === "object" &&
    prefsRow?.payload &&
    "transport" in (prefsRow.payload as object)
      ? String((prefsRow.payload as { transport?: string }).transport ?? "walking")
      : "walking";

  const { data: days } = await svc
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", tripId);

  const touchedDayIds = new Set<string>();

  for (const op of patch.operations) {
    if (op.op === "delete") {
      const { data: row } = await svc
        .from("activities")
        .select("day_id")
        .eq("id", op.activityId)
        .maybeSingle();
      if (row?.day_id) touchedDayIds.add(row.day_id);
      await svc.from("activities").delete().eq("id", op.activityId);
    } else if (op.op === "update") {
      const { data: row } = await svc
        .from("activities")
        .select("day_id")
        .eq("id", op.activityId)
        .maybeSingle();
      if (row?.day_id) touchedDayIds.add(row.day_id);
      const start =
        op.fields.startTime != null
          ? op.fields.startTime.length === 5
            ? `${op.fields.startTime}:00`
            : op.fields.startTime
          : undefined;
      await svc
        .from("activities")
        .update({
          start_time: start,
          duration_minutes: op.fields.durationMinutes,
          priority: op.fields.priority,
          planning_note: op.fields.planningNote,
          completed: op.fields.completed,
          name: op.fields.name,
          user_locked: true,
        })
        .eq("id", op.activityId);
    } else if (op.op === "move") {
      const targetDay = days?.find((d) => d.day_index === op.toDayIndex);
      if (targetDay) {
        touchedDayIds.add(targetDay.id);
        await svc
          .from("activities")
          .update({
            day_id: targetDay.id,
            sort_order: op.toSortOrder,
            user_locked: true,
          })
          .eq("id", op.activityId);
      }
    } else if (op.op === "insert") {
      const targetDay = days?.find((d) => d.day_index === op.toDayIndex);
      if (!targetDay) continue;
      touchedDayIds.add(targetDay.id);
      let name = op.name ?? "Suggested stop";
      let address: string | null = op.address ?? null;
      let lat: number | null = op.lat ?? null;
      let lng: number | null = op.lng ?? null;
      let hoursVerified = false;
      let website: string | null = null;
      let maps: string | null = null;
      let openingHours: unknown = null;
      if (op.placeId) {
        const details = await getPlaceDetails(op.placeId);
        if (details) {
          name = details.displayName;
          address = details.formattedAddress ?? address;
          lat = details.lat ?? lat;
          lng = details.lng ?? lng;
          hoursVerified = details.hoursVerified;
          website = details.websiteUri ?? null;
          maps = details.googleMapsUri ?? null;
          openingHours = details.regularOpeningHours ?? null;
        }
      }
      let startTime = op.startTime?.slice(0, 5) || "11:00";
      if (openingHours && trip.start_date) {
        const [y, m, d] = String(trip.start_date).split("-").map(Number);
        const dayDate = new Date(y, (m || 1) - 1, (d || 1) + targetDay.day_index);
        const fit = fitVisit({
          openingHours,
          cursor: startTime,
          durationMinutes: op.durationMinutes ?? 75,
          dayDate,
        });
        if (fit.status === "open") {
          startTime = fit.start;
          hoursVerified = true;
        }
      }
      await svc.from("activities").insert({
        day_id: targetDay.id,
        place_id: op.placeId ?? null,
        name,
        address,
        lat,
        lng,
        start_time: `${startTime}:00`.slice(0, 8),
        duration_minutes: op.durationMinutes,
        priority: op.priority,
        planning_note:
          op.planningNote ??
          (op.placeId
            ? null
            : "AI suggestion — verify location before visiting"),
        hours_verified: hoursVerified,
        website_uri: website,
        google_maps_uri: maps,
        popularity_label: op.popularityLabel ?? null,
        popularity_sources: op.popularitySources ?? null,
        sort_order: 999,
        source: op.recommended ? "food_recommend" : "ai",
        user_locked: false,
      });
    } else if (op.op === "shift_day") {
      const targetDay = days?.find((d) => d.day_index === op.dayIndex);
      if (!targetDay) continue;
      touchedDayIds.add(targetDay.id);
      const { data: acts } = await svc
        .from("activities")
        .select("id, start_time, duration_minutes")
        .eq("day_id", targetDay.id);
      for (const act of acts ?? []) {
        const next = shiftActivityStartTime(
          act.start_time,
          op.shiftMinutes,
        );
        const dur = act.duration_minutes ?? 60;
        const [h, m] = next.slice(0, 5).split(":").map(Number);
        const endTotal = h * 60 + m + dur;
        const end = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:00`;
        await svc
          .from("activities")
          .update({
            start_time: next,
            end_time: end,
            planning_note: op.reason
              ? `Adjusted for: ${op.reason}`
              : "Schedule shifted",
            user_locked: true,
          })
          .eq("id", act.id);
      }
    } else if (op.op === "set_travel") {
      await svc
        .from("activities")
        .update({
          travel_minutes_from_prev: op.travelMinutesFromPrev,
          end_time: op.endTime,
          sort_order: op.sortOrder,
          user_locked: true,
        })
        .eq("id", op.activityId);
    } else if (op.op === "replace") {
      const { data: row } = await svc
        .from("activities")
        .select("day_id")
        .eq("id", op.activityId)
        .maybeSingle();
      if (row?.day_id) touchedDayIds.add(row.day_id);
      let extra: Record<string, unknown> = {
        name: op.newName,
        planning_note:
          op.planningNote ??
          "Suggested by Trip Wizard — confirm details before you visit",
        user_locked: true,
      };
      if (op.durationMinutes) {
        extra = { ...extra, duration_minutes: op.durationMinutes };
      }
      if (op.placeId) {
        const details = await getPlaceDetails(op.placeId);
        if (details) {
          extra = {
            ...extra,
            place_id: details.placeId,
            name: details.displayName,
            address: details.formattedAddress,
            lat: details.lat,
            lng: details.lng,
            hours_verified: details.hoursVerified,
            website_uri: details.websiteUri,
            google_maps_uri: details.googleMapsUri,
          };
        }
      } else {
        extra = {
          ...extra,
          hours_verified: false,
          place_id: null,
        };
      }
      await svc.from("activities").update(extra).eq("id", op.activityId);
    }
  }

  // After structural edits, re-order and retime each touched day with OSRM when possible.
  const mode =
    transport === "driving"
      ? "DRIVE"
      : transport === "transit"
        ? "TRANSIT"
        : "WALK";
  for (const dayId of touchedDayIds) {
    const { data: acts } = await svc
      .from("activities")
      .select(
        "id, place_id, name, lat, lng, start_time, duration_minutes, travel_minutes_from_prev, user_locked",
      )
      .eq("day_id", dayId)
      .order("sort_order", { ascending: true });
    const movable = (acts ?? []).filter(
      (act) =>
        act.lat != null &&
        act.lng != null &&
        !String(act.place_id ?? "").startsWith("flight:") &&
        !String(act.place_id ?? "").startsWith("transit:"),
    );
    if (movable.length < 2) continue;
    const ordered = await orderByRoutedNeighbor(
      movable.map((act) => ({
        ...act,
        lat: Number(act.lat),
        lng: Number(act.lng),
      })),
      { lat: Number(movable[0].lat), lng: Number(movable[0].lng) },
      mode,
    );
    let cursor = ordered[0].start_time?.slice(0, 5) || "09:00";
    for (let i = 0; i < ordered.length; i++) {
      const act = ordered[i];
      const travel = i === 0 ? 0 : 15;
      if (i > 0) cursor = addMinutes(cursor, travel);
      const duration = act.duration_minutes ?? 60;
      await svc
        .from("activities")
        .update({
          start_time: `${cursor}:00`.slice(0, 8),
          travel_minutes_from_prev: travel,
          sort_order: i,
        })
        .eq("id", act.id);
      cursor = addMinutes(cursor, duration);
    }
  }

  await svc
    .from("trips")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", tripId);

  return NextResponse.json({ ok: true, retimedDays: touchedDayIds.size });
}
