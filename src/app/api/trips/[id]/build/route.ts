import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { generateItinerary } from "@/lib/ai/generate-itinerary";
import { constraintsFromConversation } from "@/lib/ai/constraints";
import {
  dbError,
  saveGeneratedItinerary,
  updateTripStatus,
} from "@/lib/db/trips";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { budgetFromConversation } from "@/lib/trips/budget";
import type {
  InboundFlightPrefs,
  TripLeg,
  TripPreferencesPayload,
} from "@/lib/types/trip";
import {
  LANGUAGE_COOKIE,
  normalizeLanguage,
} from "@/lib/i18n/preference";

/** Long-running fill after the trip shell is already open. */
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const jar = await cookies();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gateFeature, PRO_REQUIRED_MESSAGE } = await import(
    "@/lib/billing/entitlements"
  );
  const { withProfileEntitlement } = await import("@/lib/billing/access");
  const gate = gateFeature(
    "generate",
    await withProfileEntitlement((name) => jar.get(name)?.value, {
      id: user.id,
      email: user.email,
    }),
  );
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error:
          gate.used >= gate.limit
            ? `Free includes ${gate.limit} AI requests this month. Upgrade to Plus for more AI planning this month.`
            : PRO_REQUIRED_MESSAGE,
        code: gate.used >= gate.limit ? "ai_limit" : "pro_required",
      },
      { status: 402 },
    );
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json(
      { error: "Database not configured (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 503 },
    );
  }

  const { data: trip } = await svc
    .from("trips")
    .select("id, destination, start_date, end_date, status, owner_id")
    .eq("id", tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Skip rebuild only when every day already has enough sightseeing stops.
  // A single placeholder activity must not block full generation.
  if (trip.status === "ready") {
    const { data: dayRows } = await svc
      .from("itinerary_days")
      .select("id")
      .eq("trip_id", tripId);
    const dayIds = (dayRows ?? []).map((d) => d.id);
    if (dayIds.length) {
      const { data: acts } = await svc
        .from("activities")
        .select("id, day_id, place_id")
        .in("day_id", dayIds);
      const byDay = new Map<string, number>();
      for (const id of dayIds) byDay.set(id, 0);
      for (const act of acts ?? []) {
        const pid = String(act.place_id ?? "");
        if (pid.startsWith("flight:") || pid.startsWith("transit:")) continue;
        byDay.set(act.day_id, (byDay.get(act.day_id) ?? 0) + 1);
      }
      const minPerDay = 3;
      const full =
        dayIds.length > 0 &&
        [...byDay.values()].every((n) => n >= minPerDay);
      if (full) {
        return NextResponse.json({ tripId, status: "ready", reused: true });
      }
    }
  }

  const { data: prefsRow } = await svc
    .from("trip_preferences")
    .select("payload")
    .eq("trip_id", tripId)
    .maybeSingle();
  const { data: priorRow } = await svc
    .from("trip_priorities")
    .select("must_see, preferred, optional, avoid, ideal_trip")
    .eq("trip_id", tripId)
    .maybeSingle();

  const prefs = (prefsRow?.payload ?? {}) as TripPreferencesPayload;
  const legs = (prefs.legs ?? []) as TripLeg[];
  const idealTrip = priorRow?.ideal_trip || prefs.idealTrip || "";
  const interests = prefs.interests ?? [];
  const inbound = prefs.inboundFlight as
    | (InboundFlightPrefs & { lat?: number; lng?: number })
    | undefined;

  try {
    await updateTripStatus(tripId, "generating");

    const generated = await generateItinerary({
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      interests,
      intensity: prefs.intensity ?? "balanced",
      transport: prefs.transport ?? "walk",
      mustSee: priorRow?.must_see ?? [],
      preferred: priorRow?.preferred ?? [],
      avoid: priorRow?.avoid ?? [],
      idealTrip,
      prefersHiddenGems: prefs.prefersHiddenGems,
      budget: prefs.budget ?? budgetFromConversation(idealTrip).total,
      budgetAllocation:
        prefs.budgetAllocation ?? budgetFromConversation(idealTrip).allocation,
      restaurantStyle:
        prefs.restaurantStyle ?? budgetFromConversation(idealTrip).restaurantStyle,
      rejectedPlaceIds: prefs.rejectedPlaceIds,
      keptPlaceIds: prefs.keptPlaceIds,
      party:
        prefs.party ??
        constraintsFromConversation(idealTrip, interests).party,
      interestWeights:
        prefs.interestWeights ??
        constraintsFromConversation(idealTrip, interests).interestWeights,
      downrankedInterests: prefs.downrankedInterests,
      maxWalkMinutes:
        prefs.maxWalkMinutes ??
        constraintsFromConversation(idealTrip, interests).maxWalkMinutes,
      indoorOutdoor:
        prefs.indoorOutdoor ??
        constraintsFromConversation(idealTrip, interests).indoorOutdoor,
      dietary: prefs.dietary,
      accessibility:
        prefs.accessibility ||
        constraintsFromConversation(idealTrip, interests).accessibility,
      dayStart: prefs.dayStart,
      dayEnd: prefs.dayEnd,
      hotel: prefs.hotel || legs[0]?.hotel,
      legs: legs.length
        ? legs
        : [
            {
              city: trip.destination,
              days: Math.max(
                1,
                Math.round(
                  (new Date(trip.end_date).getTime() -
                    new Date(trip.start_date).getTime()) /
                    86_400_000,
                ) + 1,
              ),
              hotel: prefs.hotel,
            },
          ],
      inboundFlight: inbound,
      bookedRestaurants: Array.isArray(prefs.bookedRestaurants)
        ? prefs.bookedRestaurants
        : undefined,
      language: normalizeLanguage(
        prefs.language || jar.get(LANGUAGE_COOKIE)?.value,
      ),
    });

    await saveGeneratedItinerary({
      tripId,
      days: generated.days,
      warnings: generated.warnings,
    });

    try {
      await svc.from("ai_generations").insert({
        trip_id: tripId,
        kind: "full",
        request: { source: "build" },
        response: {
          warnings: generated.warnings,
          popularityUsed: generated.popularityUsed,
        },
      });
    } catch {
      /* optional */
    }

    const res = NextResponse.json({
      tripId,
      status: "ready",
      warnings: generated.warnings,
    });
    if (gate.consumes) {
      const { AI_USED_COOKIE, AI_MONTH_COOKIE, currentMonthKey } = await import(
        "@/lib/billing/entitlements"
      );
      const options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      };
      res.cookies.set(AI_USED_COOKIE, String(gate.used + 1), options);
      res.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), options);
    }
    return res;
  } catch (err) {
    try {
      await updateTripStatus(tripId, "failed");
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: dbError(err, "Could not build this itinerary").message },
      { status: 400 },
    );
  }
}
