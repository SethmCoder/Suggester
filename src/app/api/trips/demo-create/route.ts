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
import { dbError } from "@/lib/db/trips";
import { budgetFromConversation } from "@/lib/trips/budget";
import {
  IDEAL_TRIP_MAX,
  LIST_ITEM_MAX,
  LIST_MAX,
  TRAVELER_NOTES_MAX,
  truncateStringList,
  truncateText,
} from "@/lib/trips/truncate-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InboundFlightPrefs } from "@/lib/types/trip";
import {
  LANGUAGE_COOKIE,
  normalizeLanguage,
} from "@/lib/i18n/preference";

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
  // Soft-truncate oversized pastes — never reject the whole create for length.
  mustSee: z
    .array(z.string())
    .default([])
    .transform((values) => truncateStringList(values, LIST_MAX, LIST_ITEM_MAX)),
  preferred: z
    .array(z.string())
    .default([])
    .transform((values) => truncateStringList(values, LIST_MAX, LIST_ITEM_MAX)),
  optional: z
    .array(z.string())
    .default([])
    .transform((values) => truncateStringList(values, LIST_MAX, LIST_ITEM_MAX)),
  avoid: z
    .array(z.string())
    .default([])
    .transform((values) => truncateStringList(values, LIST_MAX, LIST_ITEM_MAX)),
  idealTrip: z
    .string()
    .default("")
    .transform((value) => truncateText(value, IDEAL_TRIP_MAX) ?? ""),
  tripTitle: z.string().max(80).optional(),
  language: z.string().max(16).optional(),
  preferredAirlines: z.string().optional(),
  flightPricePoint: z.enum(["any", "budget", "standard", "premium"]).optional(),
  chosenAirline: z.string().optional(),
  legs: z
    .array(
      z.object({
        city: z.string().min(1),
        country: z.string().optional(),
        days: z.number().int().min(1).max(30),
        arrivalDate: z.string().optional(),
        departureDate: z.string().optional(),
        nights: z.number().int().min(0).max(60).optional(),
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
        hotelPlace: z.preprocess(
          (value) => (value === "" || value == null ? undefined : value),
          z.enum(["any", "center", "beach", "sights", "transit"]).optional(),
        ),
        hotelBrand: z.string().optional(),
        transitFromPrevious: z.preprocess(
          (value) => (value === "" || value == null ? undefined : value),
          z
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
        ),
      }),
    )
    .optional(),
  futureTripId: z.string().min(1).max(120).optional(),
  partyType: z.enum(["solo", "couple", "family", "friends"]).optional(),
  kidAges: z.string().max(80).optional(),
  kidEnergy: z.enum(["calm", "balanced", "high"]).optional(),
  travelerNotes: z
    .string()
    .optional()
    .transform((value) => truncateText(value, TRAVELER_NOTES_MAX)),
  flightNumber: z.string().max(16).optional(),
  arrivalLocal: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const hhmm = value.trim().match(/^(\d{1,2}:\d{2})/);
      return hhmm ? hhmm[1].padStart(5, "0") : value.trim().slice(0, 8);
    }),
  travelerMode: z.enum(["business", "leisure"]).optional(),
  planningClarity: z
    .enum(["know_where_and_what", "know_where_not_what", "know_neither"])
    .optional(),
});

/**
 * Generate an itinerary stored on-device (demo or signed-in offline fallback).
 * Does not write the trip to Supabase.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);
  let user: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch {
    user = null;
  }
  if (!demo && !user) {
    return NextResponse.json(
      { error: "Demo session or sign-in required" },
      { status: 401 },
    );
  }

  try {
    const jar = await cookies();
    const billing = readPlan((name) => jar.get(name)?.value);
    // Demo is a sandbox — don't block generation on the free trip cap.
    if (!demo && !canCreateTrip(billing)) {
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
    // Signed-in offline fallback uses the personal entitlement.
    const gate = gateFeature(
      "generate",
      await withProfileEntitlement(
        (name) => jar.get(name)?.value,
        demo ? null : user ? { id: user.id, email: user.email } : null,
      ),
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

    // Keep trip-wide dayStart as the traveler's preferred morning start.
    // Arrival-day timing comes from inboundFlight.suggestedDayStart only.
    const dayStart = body.dayStart ?? "09:00";
    if (inboundFlight && !inboundFlight.suggestedDayStart) {
      inboundFlight.suggestedDayStart = dayStart;
    }
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

    const talkedBudget = budgetFromConversation(body.idealTrip);
    const language = normalizeLanguage(
      body.language || jar.get(LANGUAGE_COOKIE)?.value,
    );
    const budgetTotal = body.budget ?? talkedBudget.total;
    const budgetAllocation = body.budgetAllocation ?? talkedBudget.allocation;
    const restaurantStyle = body.restaurantStyle ?? talkedBudget.restaurantStyle;

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
      budget: budgetTotal,
      budgetAllocation,
      restaurantStyle,
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
      language,
    });

    const res = NextResponse.json({
      destination,
      tripTitle: body.tripTitle,
      days: generated.days,
      warnings: generated.warnings,
      legs: body.legs ?? [],
      budget: budgetTotal,
      currency: body.currency ?? "USD",
      budgetAllocation,
      restaurantStyle,
      language,
    });
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    };
    if (!demo) {
      res.cookies.set(PLAN_COOKIE, billing.plan, options);
      res.cookies.set(USED_COOKIE, String(billing.used + 1), options);
      if (gate.consumes) {
        const { AI_USED_COOKIE, AI_MONTH_COOKIE, currentMonthKey } = await import(
          "@/lib/billing/entitlements"
        );
        res.cookies.set(AI_USED_COOKIE, String(gate.used + 1), options);
        res.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), options);
      }
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
    return NextResponse.json(
      { error: dbError(err, "Create failed").message },
      { status: 400 },
    );
  }
}
