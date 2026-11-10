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
import { constraintsFromConversation } from "@/lib/ai/constraints";
import { budgetFromConversation } from "@/lib/trips/budget";
import type { InboundFlightPrefs } from "@/lib/types/trip";
import { assertValidDateRange, nightsBetween } from "@/lib/trips/dates";
import { applyTripDatesToLegs } from "@/lib/trips/legs";
import { AnalyticsEvent } from "@/lib/analytics/events";
import { trackServerEvent } from "@/lib/analytics/track";

const legSchema = z.object({
  city: z.string().min(1),
  country: z.string().optional(),
  days: z.number().int().min(1).max(30),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  nights: z.number().int().min(0).max(60).optional(),
  intensity: z.enum(["relaxed", "balanced", "packed"]).optional(),
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
});

const bodySchema = z.object({
  destination: z.string().min(2),
  departureCity: z.string().optional(),
  originAirport: z.string().optional(),
  destinationAirport: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  travelers: z.number().optional(),
  budget: z.number().optional(),
  budgetAllocation: z.enum(["sights", "food", "getting-around", "mostly-free"]).optional(),
  restaurantStyle: z.enum(["street", "casual", "sit-down", "mix"]).optional(),
  rejectedPlaceIds: z.array(z.string().max(120)).max(40).optional(),
  keptPlaceIds: z.array(z.string().max(120)).max(40).optional(),
  party: z.enum(["solo", "couple", "family", "multigen", "friends", "business"]).optional(),
  travelerMode: z.enum(["business", "leisure"]).optional(),
  planningClarity: z
    .enum(["know_where_and_what", "know_where_not_what", "know_neither"])
    .optional(),
  cityIntensities: z
    .record(z.string(), z.enum(["relaxed", "balanced", "packed"]))
    .optional(),
  interestWeights: z.record(z.string(), z.number()).optional(),
  downrankedInterests: z.array(z.string().max(80)).max(20).optional(),
  maxWalkMinutes: z.number().int().min(5).max(180).optional(),
  indoorOutdoor: z.enum(["indoor", "outdoor", "either"]).optional(),
  currency: z.string().optional(),
  interests: z.array(z.string()).default([]),
  intensity: z.enum(["relaxed", "balanced", "packed"]),
  transport: z.string(),
  hotel: z.string().optional(),
  dietary: z.string().optional(),
  accessibility: z.string().optional(),
  dayStart: z.string().optional(),
  dayEnd: z.string().optional(),
  flightNumber: z.string().max(16).optional(),
  arrivalLocal: z.string().max(8).optional(),
  partyType: z.enum(["solo", "couple", "family", "friends"]).optional(),
  kidAges: z.string().max(80).optional(),
  kidEnergy: z.enum(["calm", "balanced", "high"]).optional(),
  travelerNotes: z.string().max(2000).optional(),
  prefersHiddenGems: z.boolean().optional(),
  mustSee: z.array(z.string()).default([]),
  preferred: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  idealTrip: z.string().default(""),
  tripTitle: z.string().max(80).optional(),
  preferredAirlines: z.string().optional(),
  flightPricePoint: z.enum(["any", "budget", "standard", "premium"]).optional(),
  chosenAirline: z.string().optional(),
  idempotencyKey: z.string().max(120).optional(),
  futureTripId: z.string().uuid().optional(),
  legs: z.array(legSchema).optional(),
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
      await withProfileEntitlement((name) => jar.get(name)?.value, { id: user.id, email: user.email }),
    );
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error:
            gate.used >= gate.limit
              ? `Free includes ${gate.limit} AI requests this month. Upgrade to Pro for more generation.`
              : PRO_REQUIRED_MESSAGE,
          code: gate.used >= gate.limit ? "ai_limit" : "pro_required",
        },
        { status: 402 },
      );
    }

    const parsed = bodySchema.parse(await req.json());
    try {
      assertValidDateRange(parsed.startDate, parsed.endDate);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid dates" },
        { status: 400 },
      );
    }
    let mergedInterests = parsed.interests ?? [];
    let mergedWeights = parsed.interestWeights ?? {};
    let downrankedInterests: string[] = [];
    try {
      const {
        loadTravelIntelligence,
        effectiveInterestsServer,
        interestWeightsFromIntelligence,
        downrankedInterestsServer,
      } = await import("@/lib/intelligence/server");
      const profile = await loadTravelIntelligence(supabase, user.id);
      mergedInterests = [
        ...new Set([
          ...(parsed.interests ?? []),
          ...effectiveInterestsServer(profile),
        ]),
      ];
      mergedWeights = {
        ...interestWeightsFromIntelligence(profile),
        ...(parsed.interestWeights ?? {}),
      };
      downrankedInterests = downrankedInterestsServer(profile);
    } catch {
      /* keep request interests */
    }
    const datedLegs = parsed.legs?.length
      ? applyTripDatesToLegs(parsed.legs, parsed.startDate, parsed.endDate)
      : parsed.legs;
    const legs = datedLegs?.length
      ? anchorUnbookedLegs(datedLegs)
      : datedLegs;
    const body = {
      ...parsed,
      interests: mergedInterests,
      interestWeights: mergedWeights,
      downrankedInterests,
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

    const arrivalHHMM = body.arrivalLocal?.slice(0, 5);
    const lateArrival =
      arrivalHHMM &&
      (() => {
        const [h, m] = arrivalHHMM.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0) >= 18 * 60;
      })();
    const dayStart = lateArrival
      ? "10:00"
      : inboundFlight?.suggestedDayStart ?? body.dayStart ?? "09:00";

    const destinationLabel = body.legs?.length
      ? body.legs.map((l) => l.city).join(" → ")
      : body.destination;

    const defaultDays = Math.max(
      1,
      nightsBetween(body.startDate, body.endDate) + 1,
    );
    const resolvedLegs = body.legs?.length
      ? body.legs
      : [
          {
            city: body.destination,
            days: defaultDays,
            nights: nightsBetween(body.startDate, body.endDate),
            arrivalDate: body.startDate,
            departureDate: body.endDate,
            hotel: body.hotel,
          },
        ];

    const created = await createTripRecord({
      ownerId: user.id,
      destination: destinationLabel,
      startDate: body.startDate,
      endDate: body.endDate,
      preferences: {
        destinations: resolvedLegs.map((l) => ({
          name: l.city,
          nights: l.nights ?? Math.max(0, l.days - 1),
          country: l.country,
        })),
        legs: resolvedLegs,
        departureCity: body.departureCity,
        originAirport: inboundFlight?.fromIata ?? body.originAirport,
        destinationAirport: inboundFlight?.toIata ?? body.destinationAirport,
        inboundFlight,
        flightNumber: body.flightNumber,
        arrivalLocal: body.arrivalLocal,
        travelers: body.travelers,
        budget: body.budget ?? budgetFromConversation(body.idealTrip).total,
        budgetAllocation:
          body.budgetAllocation ?? budgetFromConversation(body.idealTrip).allocation,
        restaurantStyle:
          body.restaurantStyle ?? budgetFromConversation(body.idealTrip).restaurantStyle,
        rejectedPlaceIds: body.rejectedPlaceIds,
        keptPlaceIds: body.keptPlaceIds,
        party:
          body.party ??
          (body.travelerMode === "business"
            ? "business"
            : constraintsFromConversation(body.idealTrip, body.interests).party),
        travelerMode: body.travelerMode,
        planningClarity: body.planningClarity,
        cityIntensities: body.cityIntensities,
        interestWeights:
          body.interestWeights ??
          constraintsFromConversation(body.idealTrip, body.interests).interestWeights,
        maxWalkMinutes:
          body.maxWalkMinutes ??
          constraintsFromConversation(body.idealTrip, body.interests).maxWalkMinutes,
        indoorOutdoor:
          body.indoorOutdoor ??
          constraintsFromConversation(body.idealTrip, body.interests).indoorOutdoor,
        accessibility:
          body.accessibility ||
          constraintsFromConversation(body.idealTrip, body.interests).accessibility,
        currency: body.currency,
        interests: body.interests,
        intensity: body.intensity,
        transport: body.transport,
        hotel: body.hotel,
        dietary: body.dietary,
        dayStart,
        dayEnd: body.dayEnd,
        prefersHiddenGems: body.prefersHiddenGems,
        idealTrip: body.idealTrip,
        title: body.tripTitle,
      },
      priorities: {
        mustSee: body.mustSee,
        preferred: body.preferred,
        optional: body.optional,
        avoid: body.avoid,
        idealTrip: body.idealTrip,
      },
      idempotencyKey: body.idempotencyKey,
    });
    const tripId = created.tripId;

    if (body.futureTripId && !created.reused) {
      await supabase
        .from("future_trips")
        .update({
          converted_trip_id: tripId,
          status: "planning",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.futureTripId)
        .eq("owner_id", user.id);
    }

    if (created.reused) {
      return NextResponse.json({ tripId, reused: true, warnings: [] as string[] });
    }

    const generated = await generateItinerary({
      destination: destinationLabel,
      startDate: body.startDate,
      endDate: body.endDate,
      interests: body.interests,
      intensity: body.intensity,
      transport: body.transport,
      mustSee: body.mustSee,
      preferred: body.preferred,
      avoid: body.avoid,
      idealTrip: body.idealTrip,
      prefersHiddenGems: body.prefersHiddenGems,
      budget: body.budget ?? budgetFromConversation(body.idealTrip).total,
      budgetAllocation:
        body.budgetAllocation ?? budgetFromConversation(body.idealTrip).allocation,
      restaurantStyle:
        body.restaurantStyle ?? budgetFromConversation(body.idealTrip).restaurantStyle,
      rejectedPlaceIds: body.rejectedPlaceIds,
      keptPlaceIds: body.keptPlaceIds,
      party: body.party ?? constraintsFromConversation(body.idealTrip, body.interests).party,
      interestWeights:
        body.interestWeights ??
        constraintsFromConversation(body.idealTrip, body.interests).interestWeights,
      downrankedInterests: body.downrankedInterests,
      maxWalkMinutes:
        body.maxWalkMinutes ??
        constraintsFromConversation(body.idealTrip, body.interests).maxWalkMinutes,
      indoorOutdoor:
        body.indoorOutdoor ??
        constraintsFromConversation(body.idealTrip, body.interests).indoorOutdoor,
      dietary: body.dietary,
      accessibility:
        body.accessibility ||
        constraintsFromConversation(body.idealTrip, body.interests).accessibility,
      dayStart,
      dayEnd: body.dayEnd,
      hotel: body.hotel,
      legs: resolvedLegs,
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

    await trackServerEvent({
      event: AnalyticsEvent.TripPlanned,
      userId: user.id,
      properties: {
        tripId,
        destination: destinationLabel,
        multiCity: (resolvedLegs?.length ?? 0) > 1,
      },
      path: "/trips/new",
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
    if (gate.consumes) {
      const { AI_USED_COOKIE, AI_MONTH_COOKIE, currentMonthKey } = await import(
        "@/lib/billing/entitlements"
      );
      res.cookies.set(AI_USED_COOKIE, String(gate.used + 1), options);
      res.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), options);
    }
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
