import { NextResponse } from "next/server";
import { z } from "zod";
import { assistantPatchSchema } from "@/lib/ai/patch";
import { createSupabaseServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPlaceDetails } from "@/lib/google/places";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patch = assistantPatchSchema.parse(await req.json());
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
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

  for (const op of patch.operations) {
    if (op.op === "delete") {
      await svc.from("activities").delete().eq("id", op.activityId);
    } else if (op.op === "update") {
      await svc
        .from("activities")
        .update({ ...op.fields, user_locked: true })
        .eq("id", op.activityId);
    } else if (op.op === "move") {
      const { data: days } = await svc
        .from("itinerary_days")
        .select("id, day_index")
        .eq("trip_id", tripId);
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
      const { data: days } = await svc
        .from("itinerary_days")
        .select("id, day_index")
        .eq("trip_id", tripId);
      const targetDay = days?.find((d) => d.day_index === op.toDayIndex);
      const details = await getPlaceDetails(op.placeId);
      if (targetDay && details) {
        await svc.from("activities").insert({
          day_id: targetDay.id,
          place_id: op.placeId,
          name: details.displayName,
          address: details.formattedAddress,
          lat: details.lat,
          lng: details.lng,
          start_time: op.startTime,
          duration_minutes: op.durationMinutes,
          priority: op.priority,
          hours_verified: details.hoursVerified,
          website_uri: details.websiteUri,
          google_maps_uri: details.googleMapsUri,
          sort_order: 999,
          source: "ai",
          user_locked: false,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
