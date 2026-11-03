import { NextResponse } from "next/server";
import { z } from "zod";
import { generateItinerary } from "@/lib/ai/generate-itinerary";
import { createTripRecord, saveGeneratedItinerary } from "@/lib/db/trips";
import { estimateFlight } from "@/lib/flights/openflights";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { InboundFlightPrefs } from "@/lib/types/trip";

const bodySchema = z.object({
  destination: z.string().min(2),
  departureCity: z.string().optional(),
  originAirport: z.string().optional(),
  destinationAirport: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  travelers: z.number().optional(),
  budget: z.number().optional(),
  currency: z.string().optional(),
  interests: z.array(z.string()).default([]),
  intensity: z.enum(["relaxed", "balanced", "packed"]),
  transport: z.string(),
  hotel: z.string().optional(),
  dietary: z.string().optional(),
  accessibility: z.string().optional(),
  dayStart: z.string().optional(),
  dayEnd: z.string().optional(),
  prefersHiddenGems: z.boolean().optional(),
  mustSee: z.array(z.string()).default([]),
  preferred: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  idealTrip: z.string().default(""),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    if (!createServiceClient()) {
      return NextResponse.json(
        { error: "Database not configured (SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 503 },
      );
    }

    let inboundFlight: InboundFlightPrefs | undefined;
    let arrivalCoords: { lat: number; lng: number } | undefined;
    const origin = body.originAirport || body.departureCity;
    const destAirport = body.destinationAirport || body.destination;
    if (origin && destAirport) {
      try {
        const est = await estimateFlight({ from: origin, to: destAirport });
        if (est) {
          arrivalCoords = { lat: est.to.lat, lng: est.to.lng };
          inboundFlight = {
            fromIata: est.from.iata,
            toIata: est.to.iata,
            fromName: `${est.from.name} (${est.from.city})`,
            toName: `${est.to.name} (${est.to.city})`,
            distanceKm: est.distanceKm,
            durationMinutes: est.durationMinutes,
            assumedDepartureLocal: est.assumedDepartureLocal,
            estimatedArrivalLocal: est.estimatedArrivalLocal,
            arrivalDayOffset: est.arrivalDayOffset,
            suggestedDayStart: est.suggestedDayStart,
            routeKnown: est.routeKnown,
            note: est.note,
          };
        }
      } catch {
        /* OpenFlights optional — trip still creates */
      }
    }

    const dayStart =
      inboundFlight?.suggestedDayStart ?? body.dayStart ?? "09:00";

    const tripId = await createTripRecord({
      ownerId: user.id,
      destination: body.destination,
      startDate: body.startDate,
      endDate: body.endDate,
      preferences: {
        destinations: [{ name: body.destination }],
        departureCity: body.departureCity,
        originAirport: inboundFlight?.fromIata ?? body.originAirport,
        destinationAirport: inboundFlight?.toIata ?? body.destinationAirport,
        inboundFlight,
        travelers: body.travelers,
        budget: body.budget,
        currency: body.currency,
        interests: body.interests,
        intensity: body.intensity,
        transport: body.transport,
        hotel: body.hotel,
        dietary: body.dietary,
        accessibility: body.accessibility,
        dayStart,
        dayEnd: body.dayEnd,
        prefersHiddenGems: body.prefersHiddenGems,
        idealTrip: body.idealTrip,
      },
      priorities: {
        mustSee: body.mustSee,
        preferred: body.preferred,
        optional: body.optional,
        avoid: body.avoid,
        idealTrip: body.idealTrip,
      },
    });

    const generated = await generateItinerary({
      destination: body.destination,
      startDate: body.startDate,
      endDate: body.endDate,
      interests: body.interests,
      intensity: body.intensity,
      transport: body.transport,
      mustSee: body.mustSee,
      avoid: body.avoid,
      idealTrip: body.idealTrip,
      prefersHiddenGems: body.prefersHiddenGems,
      budget: body.budget,
      dayStart,
      dayEnd: body.dayEnd,
      inboundFlight: inboundFlight
        ? { ...inboundFlight, ...arrivalCoords }
        : undefined,
    });

    await saveGeneratedItinerary({
      tripId,
      days: generated.days,
      warnings: generated.warnings,
    });

    const svc = createServiceClient()!;
    await svc.from("ai_generations").insert({
      trip_id: tripId,
      kind: "full",
      request: body,
      response: { warnings: generated.warnings, popularityUsed: generated.popularityUsed },
    });

    return NextResponse.json({ tripId, warnings: generated.warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
