import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { buildStayAdvise } from "@/lib/dreamer/stay-advise";
import type { ParsedBooking } from "@/lib/dreamer/types";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { city?: string; landDate?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const svc = createServiceClient();
  let city = body.city?.trim() || "Tokyo";
  let landDate: string | null = body.landDate?.trim() || null;

  if (user && svc) {
    const { data: dream } = await svc
      .from("future_trips")
      .select("destination, potential_start, owner_id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (dream) {
      city = dream.destination;
      const { data: bookings } = await svc
        .from("dreamer_bookings")
        .select("parsed, kind, starts_at")
        .eq("owner_id", user.id)
        .eq("future_trip_id", id)
        .order("created_at", { ascending: true });

      const flight = (bookings ?? []).find((b) => b.kind === "flight");
      const parsed = (flight?.parsed ??
        bookings?.[0]?.parsed ??
        {}) as ParsedBooking;
      landDate =
        parsed.startDate ??
        dream.potential_start ??
        (flight?.starts_at ? String(flight.starts_at).slice(0, 10) : null) ??
        landDate;
    }
  }

  if (!landDate) {
    return NextResponse.json({
      events: [],
      stayUntil: null,
      rationale:
        "No concrete arrival date on a booking yet. Stay-until dates are not invented without evidence.",
      catalogStayHint: null,
    });
  }

  const advise = await buildStayAdvise({ city, landDate });

  if (user && svc) {
    await svc
      .from("future_trips")
      .update({
        preferences: {
          dreamer: {
            stayAdvise: advise,
            stayAdviseAt: new Date().toISOString(),
          },
        },
        estimated_duration_days: advise.stayUntil
          ? Math.max(
              1,
              Math.round(
                (Date.parse(`${advise.stayUntil}T12:00:00`) -
                  Date.parse(`${landDate}T12:00:00`)) /
                  86_400_000,
              ) + 1,
            )
          : undefined,
        potential_end: advise.stayUntil ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id);
  }

  return NextResponse.json(advise);
}
