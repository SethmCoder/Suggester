import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  tripId: z.string().min(1),
  dayIndex: z.number().int().min(0).max(30),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  place: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(180),
    address: z.string().nullable().optional(),
    lat: z.number(),
    lng: z.number(),
    category: z.string().max(40).optional(),
    mapsUrl: z.string().nullable().optional(),
    photoName: z.string().nullable().optional(),
    hours: z.string().nullable().optional(),
    why: z.string().max(400).optional(),
  }),
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to add this to a saved trip." }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { data: trip } = await db
    .from("trips")
    .select("id, start_date")
    .eq("id", body.tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const { data: days } = await db
    .from("itinerary_days")
    .select("id, day_index")
    .eq("trip_id", trip.id)
    .order("day_index");
  const day = (days ?? []).find((row) => row.day_index === body.dayIndex);
  if (!day) return NextResponse.json({ error: "That day is not on the trip." }, { status: 400 });

  const { data: existing } = await db
    .from("activities")
    .select("id, place_id")
    .eq("day_id", day.id);
  if ((existing ?? []).some((row) => row.place_id === body.place.id)) {
    return NextResponse.json({ error: "That place is already on this day." }, { status: 409 });
  }

  const [hour, minute] = body.startTime.split(":").map(Number);
  const endTotal = hour * 60 + minute + 90;
  const end = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
  const { error } = await db.from("activities").insert({
    day_id: day.id,
    place_id: body.place.id,
    name: body.place.name,
    address: body.place.address ?? null,
    lat: body.place.lat,
    lng: body.place.lng,
    start_time: `${body.startTime}:00`,
    end_time: `${end}:00`,
    duration_minutes: 90,
    priority: "optional",
    planning_note: body.place.why || null,
    hours_verified: Boolean(body.place.hours),
    opening_hours: body.place.hours ? { text: body.place.hours } : null,
    google_maps_uri: body.place.mapsUrl ?? null,
    photo_name: body.place.photoName ?? null,
    sort_order: (existing ?? []).length,
    source: "explorer",
    user_locked: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, tripId: trip.id, dayIndex: body.dayIndex });
}
