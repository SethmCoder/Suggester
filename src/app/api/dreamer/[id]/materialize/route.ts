import { NextResponse } from "next/server";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { datesFromDreamAndBooking } from "@/lib/dreamer/materialize";
import { evidencePackFromBookings } from "@/lib/dreamer/evidence-pack";
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

  const evidence = evidencePackFromBookings(
    (bookings ?? []).map((b) => ({
      kind: String(b.kind),
      parsed: (b.parsed ?? {}) as ParsedBooking,
      title: b.title as string | null,
    })),
  );

  if (!evidence.ready) {
    return NextResponse.json(
      {
        error:
          "Paste a real confirmation first — Waypoint only builds trips from booking evidence.",
        code: "evidence_required",
      },
      { status: 400 },
    );
  }

  const parsed = evidence.flight ?? ({} as ParsedBooking);
  const dates = datesFromDreamAndBooking({
    booking: parsed.startDate ? parsed : evidence.hotel ?? parsed,
    potentialStart: dream.potential_start,
    potentialEnd: dream.potential_end,
    estimatedDurationDays: dream.estimated_duration_days,
  });

  const origin = evidence.fromIata;
  const destAirport = evidence.toIata;
  const city =
    dream.destination.split("→")[0]?.trim() || dream.destination;

  const dreamPrefs = (dream.preferences ?? {}) as Record<string, unknown>;
  const dreamerMeta = (dreamPrefs.dreamer ?? {}) as Record<string, unknown>;
  const vibe =
    typeof dreamerMeta.vibe === "string" ? dreamerMeta.vibe : undefined;
  const prefersHiddenGems =
    Boolean(dreamPrefs.prefersHiddenGems) || vibe === "local";
  const intensity =
    dreamPrefs.intensity === "relaxed" ||
    dreamPrefs.intensity === "packed" ||
    dreamPrefs.intensity === "balanced"
      ? dreamPrefs.intensity
      : "balanced";
  const dreamNote =
    typeof dreamerMeta.idealTripNote === "string"
      ? dreamerMeta.idealTripNote
      : vibe === "local"
        ? "Dream: small local places, not tourist traps."
        : vibe === "sights"
          ? "Dream: the well-known sights."
          : "";
  const evidenceIdeal = [
    dreamNote,
    dream.notes?.trim() || "",
    evidence.provenance.length
      ? `Evidence: ${evidence.provenance.join(" · ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const createBody = {
    destination: dream.destination,
    startDate: dates.startDate,
    endDate: dates.endDate,
    originAirport: origin,
    destinationAirport: destAirport,
    travelers: dream.travelers ?? 2,
    interests: Array.isArray(dream.interests) && dream.interests.length
      ? dream.interests
      : prefersHiddenGems
        ? ["food", "neighborhoods", "markets"]
        : ["food", "culture", "landmarks"],
    intensity,
    transport: dream.transport || "transit",
    idealTrip: evidenceIdeal,
    prefersHiddenGems,
    budgetAllocation:
      vibe === "local" || prefersHiddenGems
        ? "mostly-free"
        : vibe === "sights"
          ? "sights"
          : "balanced",
    tripTitle: dream.title ?? undefined,
    hotel: evidence.hotelName,
    flightNumber: evidence.flightNumber,
    arrivalLocal: evidence.arrivalLocal,
    dayStart: evidence.arrivalLocal,
    mustSee: evidence.restaurants.map((r) => r.name).slice(0, 6),
    preferred: [] as string[],
    bookedRestaurants: evidence.restaurants,
    futureTripId: id,
    idempotencyKey: `future:${id}`,
    legs: [
      {
        city,
        days: dates.nights + 1,
        nights: dates.nights,
        arrivalDate: dates.startDate,
        departureDate: dates.endDate,
        hotel: evidence.hotelName,
        hotelBooked: Boolean(evidence.hotelName),
      },
    ],
  };

  const createRes = await fetch(
    new URL(
      "/api/trips/create",
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001",
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: _req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(createBody),
    },
  );

  if (!createRes.ok) {
    const { createTripRecord, saveGeneratedItinerary } = await import(
      "@/lib/db/trips"
    );
    const { generateItinerary } = await import("@/lib/ai/generate-itinerary");
    const { estimateFlight } = await import("@/lib/flights/openflights");
    const { findUserFlight } = await import("@/lib/flights/user-flights");

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

    // Prefer confirmation / community times over OpenFlights estimates.
    const community =
      evidence.flightNumber
        ? await findUserFlight(svc, {
            flightNumber: evidence.flightNumber,
            date: dates.startDate,
            fromIata: origin,
            toIata: destAirport,
          })
        : null;

    const arrivalLocal =
      evidence.arrivalLocal || community?.arrival_local || undefined;

    if (origin && destAirport) {
      if (arrivalLocal) {
        inboundFlight = {
          fromIata: origin,
          toIata: destAirport,
          estimatedArrivalLocal: arrivalLocal,
          suggestedDayStart: arrivalLocal,
          note: evidence.provenance.join(" · ") || "From confirmation evidence",
        };
      } else {
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
    }

    const created = await createTripRecord({
      ownerId: user.id,
      destination: dream.destination,
      startDate: dates.startDate,
      endDate: dates.endDate,
      preferences: {
        destinations: [{ name: city, nights: dates.nights }],
        legs: createBody.legs,
        originAirport: origin,
        destinationAirport: destAirport,
        inboundFlight,
        flightNumber: evidence.flightNumber,
        arrivalLocal,
        hotel: evidence.hotelName,
        travelers: dream.travelers ?? 2,
        interests: dream.interests ?? [],
        intensity: "balanced",
        transport: dream.transport || "transit",
        idealTrip: evidenceIdeal,
        title: dream.title ?? undefined,
        dayStart: arrivalLocal,
        evidenceProvenance: evidence.provenance,
      },
      priorities: {
        mustSee: [],
        preferred: [],
        optional: [],
        avoid: [],
        idealTrip: evidenceIdeal,
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
        idealTrip: evidenceIdeal,
        hotel: evidence.hotelName,
        dayStart: arrivalLocal,
        legs: createBody.legs,
        inboundFlight,
      });
      await saveGeneratedItinerary({
        tripId: created.tripId,
        days: generated.days,
      });
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
      evidence: evidence.provenance,
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
    evidence: evidence.provenance,
  });
}
