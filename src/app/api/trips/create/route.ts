import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateItinerary } from "@/lib/ai/generate-itinerary";
import {
  PLAN_COOKIE,
  PLAN_LIMIT_MESSAGE,
  USED_COOKIE,
  canCreateTrip,
  readPlan,
} from "@/lib/billing/plans";
import { anchorUnbookedLegs } from "@/lib/hotels/hotelrec";
import { createTripRecord, saveGeneratedItinerary } from "@/lib/db/trips";
import { filterAirlines, flightRestrictionNote } from "@/lib/flights/airline-class";
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
  preferredAirlines: z.string().optional(),
  flightPricePoint: z.enum(["any", "budget", "standard", "premium"]).optional(),
  chosenAirline: z.string().optional(),
  legs: z
    .array(
      z.object({
        city: z.string().min(1),
        days: z.number().int().min(1).max(30),
        hotel: z.string().optional(),
        geonameId: z.number().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        countryCode: z.string().optional(),
        hotelLat: z.number().optional(),
        hotelLng: z.number().optional(),
        hotelPlaceId: z.string().optional(),
        hotelAddress: z.string().optional(),
        hotelBooked: z.boolean().optional(),
        hotelMinRating: z.number().optional(),
        hotelPlace: z
          .enum(["any", "center", "beach", "sights", "transit"])
          .optional(),
        hotelBrand: z.string().optional(),
        transitFromPrevious: z
          .enum([
            "auto",
            "flight",
            "major_train",
            "regional_rail",
            "coach",
            "ferry",
            "car",
          ])
          .optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const billing = readPlan((name) => jar.get(name)?.value);
    if (!canCreateTrip(billing)) {
      return NextResponse.json(
        { error: PLAN_LIMIT_MESSAGE, code: "plan_limit" },
        { status: 402 },
      );
    }
    const { gateFeature, PRO_REQUIRED_MESSAGE } = await import(
      "@/lib/billing/entitlements"
    );
    const { withProfileEntitlement } = await import("@/lib/billing/access");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const gate = gateFeature(
      "generate",
      await withProfileEntitlement((name) => jar.get(name)?.value, user.id),
    );
    if (!gate.allowed) {
      return NextResponse.json(
        { error: PRO_REQUIRED_MESSAGE, code: "pro_required" },
        { status: 402 },
      );
    }

    const parsed = bodySchema.parse(await req.json());
    const legs = parsed.legs?.length
      ? anchorUnbookedLegs(parsed.legs)
      : parsed.legs;
    const body = {
      ...parsed,
      legs,
      hotel: legs?.[0]?.hotel || parsed.hotel,
    };

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
            note: [
              est.note,
              flightRestrictionNote({
                chosen: body.chosenAirline,
                preferred: body.preferredAirlines,
                pricePoint: body.flightPricePoint,
                matches: filterAirlines(est.airlines, {
                  airlines: body.preferredAirlines,
                  pricePoint: body.flightPricePoint,
                }),
              }),
            ]
              .filter(Boolean)
              .join(" "),
          };
        }
      } catch {
        /* OpenFlights optional — trip still creates */
      }
    }

    const dayStart =
      inboundFlight?.suggestedDayStart ?? body.dayStart ?? "09:00";

    const destinationLabel = body.legs?.length
      ? body.legs.map((l) => l.city).join(" → ")
      : body.destination;

    const tripId = await createTripRecord({
      ownerId: user.id,
      destination: destinationLabel,
      startDate: body.startDate,
      endDate: body.endDate,
      preferences: {
        destinations: (body.legs?.length
          ? body.legs
          : [{ city: body.destination, days: 1 }]
        ).map((l) => ({ name: l.city, nights: l.days })),
        legs: body.legs?.length
          ? body.legs
          : [
              {
                city: body.destination,
                days: Math.max(
                  1,
                  Math.ceil(
                    (new Date(body.endDate).getTime() -
                      new Date(body.startDate).getTime()) /
                      86_400_000,
                  ) + 1,
                ),
                hotel: body.hotel,
              },
            ],
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
      destination: destinationLabel,
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
      hotel: body.hotel,
      legs: body.legs?.length
        ? body.legs
        : [
            {
              city: body.destination,
              days: Math.max(
                1,
                Math.ceil(
                  (new Date(body.endDate).getTime() -
                    new Date(body.startDate).getTime()) /
                    86_400_000,
                ) + 1,
              ),
              hotel: body.hotel,
            },
          ],
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

    const res = NextResponse.json({ tripId, warnings: generated.warnings });
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    };
    res.cookies.set(PLAN_COOKIE, billing.plan, options);
    res.cookies.set(USED_COOKIE, String(billing.used + 1), options);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
