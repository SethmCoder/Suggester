import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TripPassBanner } from "@/components/billing/TripPassBanner";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ItineraryEditor } from "@/components/itinerary/ItineraryEditor";
import type { BudgetPlan } from "@/lib/trips/budget";
import {
  normalizeCategorySplit,
  normalizeExpenses,
  type ExpenseCategorySplit,
  type TripExpense,
} from "@/lib/trips/expenses";

function budgetPlanFrom(preferences: unknown): BudgetPlan | undefined {
  if (!preferences || typeof preferences !== "object") return undefined;
  const prefs = preferences as {
    budget?: number;
    currency?: string;
    budgetAllocation?: BudgetPlan["allocation"];
    restaurantStyle?: BudgetPlan["restaurantStyle"];
    party?: string;
    maxWalkMinutes?: number;
  };
  if (!prefs.budget && !prefs.budgetAllocation && !prefs.restaurantStyle && !prefs.party && !prefs.maxWalkMinutes) {
    return undefined;
  }
  return {
    total: prefs.budget,
    currency: prefs.currency,
    allocation: prefs.budgetAllocation,
    restaurantStyle: prefs.restaurantStyle,
    party: prefs.party,
    maxWalkMinutes: prefs.maxWalkMinutes,
  };
}

function expensesFrom(preferences: unknown): TripExpense[] {
  if (!preferences || typeof preferences !== "object") return [];
  return normalizeExpenses((preferences as { expenses?: unknown }).expenses);
}

function categorySplitFrom(
  preferences: unknown,
  allocation?: BudgetPlan["allocation"],
): ExpenseCategorySplit | undefined {
  if (!preferences || typeof preferences !== "object") return undefined;
  const split = (preferences as { expenseCategorySplit?: unknown })
    .expenseCategorySplit;
  if (!split) return undefined;
  return normalizeCategorySplit(split, allocation);
}
import { OfflineTripLoader } from "@/components/trips/OfflineTripLoader";
import {
  DEMO_TRIP_ID,
  getDemoTripPayload,
  isDemoTripId,
} from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { fetchTripFull } from "@/lib/db/trips";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo && isDemoTripId(id)) {
    const data = getDemoTripPayload(id);
    return (
      <>
        <DemoBanner />
        <ItineraryEditor
          tripId={id}
          destination={`${data.trip.destination} (Demo)`}
          initialDays={data.days}
          initialActivities={data.activities}
          isDemo
          startDate={data.trip.start_date}
          endDate={data.trip.end_date}
          dayCities={data.dayCities}
          initialLegs={data.legs}
          interests={data.preferences.interests}
        />
      </>
    );
  }

  // Offline-created trips (no server row) — client hydrates from localStorage
  if (id.startsWith("offline-")) {
    return <OfflineTripLoader tripId={id} />;
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    if (demo) {
      redirect(
        isDemoTripId(id) ? `/trips/${id}` : `/trips/${DEMO_TRIP_ID}`,
      );
    }
    // Allow opening via offline cache when auth/network fails
    return <OfflineTripLoader tripId={id} />;
  }

  if (!userId) {
    if (demo) {
      redirect(
        isDemoTripId(id) ? `/trips/${id}` : `/trips/${DEMO_TRIP_ID}`,
      );
    }
    return <OfflineTripLoader tripId={id} />;
  }

  try {
    const data = await fetchTripFull(id, userId);
    if (!data) {
      return <OfflineTripLoader tripId={id} />;
    }

    return (
      <>
        <TripPassBanner tripId={id} />
        <ItineraryEditor
          tripId={id}
          destination={data.trip.destination}
          initialDays={data.days}
          initialActivities={data.activities}
          startDate={data.trip.start_date}
          endDate={data.trip.end_date}
          initialStatus={
            typeof data.trip.status === "string" ? data.trip.status : null
          }
          initialLegs={
            (
              data.preferences as
                | { legs?: import("@/lib/types/trip").TripLeg[]; title?: string }
                | undefined
            )?.legs
          }
          tripTitle={
            (
              data.preferences as { title?: string } | undefined
            )?.title
          }
          interests={
            (
              data.preferences as { interests?: string[] } | undefined
            )?.interests
          }
          budgetPlan={budgetPlanFrom(data.preferences)}
          initialExpenses={expensesFrom(data.preferences)}
          initialCategorySplit={categorySplitFrom(
            data.preferences,
            budgetPlanFrom(data.preferences)?.allocation,
          )}
        />
      </>
    );
  } catch {
    return <OfflineTripLoader tripId={id} />;
  }
}
