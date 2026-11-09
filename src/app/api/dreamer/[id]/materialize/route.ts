import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { datesFromDreamAndBooking } from "@/lib/dreamer/materialize";
import type { ParsedBooking } from "@/lib/dreamer/types";

export async function POST(
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
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: dream } = await svc
    .from("future_trips")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!dream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (dream.converted_trip_id) {
    return NextResponse.json({
      tripId: dream.converted_trip_id,
      reused: true,
      redirect: `/trips/${dream.converted_trip_id}`,
    });
  }

  const { data: bookings } = await svc
    .from("dreamer_bookings")
    .select("*")
    .eq("owner_id", user.id)
    .eq("future_trip_id", id)
    .order("created_at", { ascending: true });

  const flight = (bookings ?? []).find((b) => b.kind === "flight");
  const parsed = (flight?.parsed ?? {}) as ParsedBooking;
  const dates = datesFromDreamAndBooking({
    booking: parsed,
    potentialStart: dream.potential_start,
    potentialEnd: dream.potential_end,
    estimatedDurationDays: dream.estimated_duration_days,
  });

  const origin = parsed.fromIata ?? undefined;
  const destAirport = parsed.toIata ?? undefined;

  const createRes = await fetch(
    new URL("/api/trips/create", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: _req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        destination: dream.destination,
        startDate: dates.startDate,
        endDate: dates.endDate,
        originAirport: origin,
        destinationAirport: destAirport,
        travelers: dream.travelers ?? 2,
        interests: dream.interests ?? [],
        intensity: "balanced",
        transport: dream.transport || "transit",
        idealTrip: dream.notes ?? "",
        tripTitle: dream.title ?? undefined,
        mustSee: [],
        preferred: [],
        futureTripId: id,
        idempotencyKey: `future:${id}`,
        legs: [
          {
            city: dream.destination.split("→")[0]?.trim() || dream.destination,
            days: dates.nights + 1,
            nights: dates.nights,
            arrivalDate: dates.startDate,
            departureDate: dates.endDate,
          },
        ],
      }),
    },
  );

  // Prefer in-process create when absolute URL fetch fails (local).
  if (!createRes.ok) {
    const { createTripRecord, saveGeneratedItinerary } = await import(
      "@/lib/db/trips"
    );
    const { generateItinerary } = await import("@/lib/ai/generate-itinerary");
    const { estimateFlight } = await import("@/lib/flights/openflights");

    let inboundFlight:
      | {
          fromIata: string;
          toIata: string;
          toName?: string;
          estimatedArrivalLocal?: string;
          suggestedDayStart?: string;
          durationMinutes?: number;
          note?: string;
        }
      | undefined;
    if (origin && destAirport) {
      try {
        const est = await estimateFlight({ from: origin, to: destAirport });
        if (est) {
          inboundFlight = {
            fromIata: est.from.iata,
            toIata: est.to.iata,
            toName: est.to.name,
            durationMinutes: est.durationMinutes,
            estimatedArrivalLocal: est.estimatedArrivalLocal,
            suggestedDayStart: est.suggestedDayStart,
            note: est.note,
          };
        }
      } catch {
        /* optional */
      }
    }

    const city =
      dream.destination.split("→")[0]?.trim() || dream.destination;
    const created = await createTripRecord({
      ownerId: user.id,
      destination: dream.destination,
      startDate: dates.startDate,
      endDate: dates.endDate,
      preferences: {
        destinations: [{ name: city, nights: dates.nights }],
        legs: [
          {
            city,
            days: dates.nights + 1,
            nights: dates.nights,
            arrivalDate: dates.startDate,
            departureDate: dates.endDate,
          },
        ],
        originAirport: origin,
        destinationAirport: destAirport,
        inboundFlight,
        travelers: dream.travelers ?? 2,
        interests: dream.interests ?? [],
        intensity: "balanced",
        transport: dream.transport || "transit",
        idealTrip: dream.notes ?? "",
        title: dream.title ?? undefined,
      },
      priorities: {
        mustSee: [],
        preferred: [],
        optional: [],
        avoid: [],
        idealTrip: dream.notes ?? "",
      },
      idempotencyKey: `future:${id}`,
    });

    if (!created.reused) {
      const generated = await generateItinerary({
        destination: dream.destination,
        startDate: dates.startDate,
        endDate: dates.endDate,
        interests: dream.interests ?? [],
        intensity: "balanced",
        transport: dream.transport || "transit",
        mustSee: [],
        preferred: [],
        avoid: [],
        idealTrip: dream.notes ?? "",
        legs: [
          {
            city,
            days: dates.nights + 1,
            nights: dates.nights,
            arrivalDate: dates.startDate,
            departureDate: dates.endDate,
          },
        ],
        inboundFlight,
      });
      await saveGeneratedItinerary({ tripId: created.tripId, days: generated.days });
    }

    await svc
      .from("future_trips")
      .update({
        converted_trip_id: created.tripId,
        status: "planning",
        potential_start: dates.startDate,
        potential_end: dates.endDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id);

    return NextResponse.json({
      tripId: created.tripId,
      reused: created.reused,
      redirect: `/trips/${created.tripId}`,
      nights: dates.nights,
    });
  }

  const data = (await createRes.json()) as { tripId?: string; error?: string };
  if (!data.tripId) {
    return NextResponse.json(
      { error: data.error ?? "Materialize failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    tripId: data.tripId,
    redirect: `/trips/${data.tripId}`,
    nights: dates.nights,
  });
}
