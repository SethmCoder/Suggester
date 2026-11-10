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
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { filterAirlines, flightRestrictionNote } from "@/lib/flights/airline-class";
import { estimateFlight } from "@/lib/flights/openflights";
import { anchorUnbookedLegs } from "@/lib/hotels/hotelrec";
import { constraintsFromConversation } from "@/lib/ai/constraints";
import { budgetFromConversation } from "@/lib/trips/budget";
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
  budgetAllocation: z.enum(["sights", "food", "getting-around", "mostly-free"]).optional(),
  restaurantStyle: z.enum(["street", "casual", "sit-down", "mix"]).optional(),
  rejectedPlaceIds: z.array(z.string().max(120)).max(40).optional(),
  keptPlaceIds: z.array(z.string().max(120)).max(40).optional(),
  party: z.enum(["solo", "couple", "family", "multigen", "friends", "business"]).optional(),
  interestWeights: z.record(z.string(), z.number()).optional(),
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

/** Generate an itinerary for a demo session. It is stored on the device, not in an account. */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value)) {
    return NextResponse.json({ error: "Demo session required" }, { status: 401 });
  }

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
    // Demo must not inherit a personal account's entitlement / AI usage.
    const gate = gateFeature(
      "generate",
      await withProfileEntitlement((name) => jar.get(name)?.value, null),
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
    const legs = parsed.legs?.length
      ? anchorUnbookedLegs(parsed.legs)
      : parsed.legs;
    const body = {
      ...parsed,
      legs,
      hotel: legs?.[0]?.hotel || parsed.hotel,
    };

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
        /* flight estimate is optional */
      }
    }

    const dayStart =
      inboundFlight?.suggestedDayStart ?? body.dayStart ?? "09:00";
    const destination = body.legs?.length
      ? body.legs.map((leg) => leg.city).join(" → ")
      : body.destination;
    const spanDays = Math.max(
      1,
      Math.ceil(
        (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) /
          86_400_000,
      ) + 1,
    );

    const generated = await generateItinerary({
      destination,
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
      maxWalkMinutes:
        body.maxWalkMinutes ??
        constraintsFromConversation(body.idealTrip, body.interests).maxWalkMinutes,
      indoorOutdoor:
        body.indoorOutdoor ??
        constraintsFromConversation(body.idealTrip, body.interests).indoorOutdoor,
      dietary: body.dietary,
      accessibility: body.accessibility,
      dayStart,
      dayEnd: body.dayEnd,
      hotel: body.hotel,
      legs: body.legs?.length
        ? body.legs
        : [
            {
              city: body.destination,
              days: spanDays,
              hotel: body.hotel,
            },
          ],
      inboundFlight: inboundFlight
        ? { ...inboundFlight, ...arrivalCoords }
        : undefined,
    });

    const res = NextResponse.json({
      destination,
      tripTitle: body.tripTitle,
      days: generated.days,
      warnings: generated.warnings,
      legs: body.legs ?? [],
    });
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
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] })
        .issues;
      return NextResponse.json(
        {
          error: "Trip details look incomplete or invalid",
          details: issues
            .slice(0, 6)
            .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
