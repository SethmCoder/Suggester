import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { DreamerBooking } from "@/lib/dreamer/types";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ bookings: [] as DreamerBooking[], offline: true });
  }

  const { data, error } = await svc
    .from("dreamer_bookings")
    .select("*")
    .eq("owner_id", user.id)
    .eq("future_trip_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const bookings: DreamerBooking[] = (data ?? []).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    futureTripId: row.future_trip_id,
    tripId: row.trip_id,
    inboundEmailId: row.inbound_email_id,
    kind: row.kind,
    title: row.title,
    parsed: row.parsed ?? {},
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    matchScore: row.match_score,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ bookings });
}
