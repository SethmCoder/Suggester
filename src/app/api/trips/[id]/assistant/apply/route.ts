import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { shiftActivityStartTime } from "@/lib/ai/scheduler";
import { assistantPatchSchema } from "@/lib/ai/patch";
import { isDemoTripId } from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { getPlaceDetails } from "@/lib/google/places";
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
    // Client applies demo patches to local offline store; acknowledge approval.
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
    .select("id")
    .eq("id", tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: days } = await svc
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", tripId);

  for (const op of patch.operations) {
    if (op.op === "delete") {
      await svc.from("activities").delete().eq("id", op.activityId);
    } else if (op.op === "update") {
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
      let name = op.name ?? "Suggested stop";
      let address: string | null = op.address ?? null;
      let lat: number | null = op.lat ?? null;
      let lng: number | null = op.lng ?? null;
      let hoursVerified = false;
      let website: string | null = null;
      let maps: string | null = null;
      const isOsm = op.placeId?.startsWith("osm:");
      if (op.placeId && !isOsm) {
        const details = await getPlaceDetails(op.placeId);
        if (details) {
          name = details.displayName;
          address = details.formattedAddress ?? address;
          lat = details.lat ?? lat;
          lng = details.lng ?? lng;
          hoursVerified = details.hoursVerified;
          website = details.websiteUri ?? null;
          maps = details.googleMapsUri ?? null;
        }
      }
      await svc.from("activities").insert({
        day_id: targetDay.id,
        place_id: op.placeId ?? null,
        name,
        address,
        lat,
        lng,
        start_time: op.startTime,
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
      let extra: Record<string, unknown> = {
        name: op.newName,
        planning_note:
          op.planningNote ??
          "Replaced by itinerary maker — verify place details",
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

  await svc
    .from("trips")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", tripId);

  return NextResponse.json({ ok: true });
}
