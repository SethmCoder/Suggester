import type { SupabaseClient } from "@supabase/supabase-js";
import type { FutureTrip, FutureTripPlan, FutureTripStatus } from "./types";

type FutureRow = {
  id: string;
  title: string | null;
  destination: string;
  status: FutureTripStatus;
  potential_start: string | null;
  potential_end: string | null;
  estimated_duration_days: number | null;
  travelers: number | null;
  budget: number | null;
  currency: string | null;
  interests: string[] | null;
  transport: string | null;
  notes: string | null;
  preferences: Record<string, unknown> | null;
  cover_image_url: string | null;
  converted_trip_id: string | null;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: string;
  future_trip_id: string;
  label: string;
  payload: Record<string, unknown>;
  estimated_expenses: string | null;
  created_at: string;
  updated_at: string;
};

type LinkRow = { future_trip_id: string; wishlist_item_id: string };

export function mapPlan(row: PlanRow): FutureTripPlan {
  return {
    id: row.id,
    futureTripId: row.future_trip_id,
    label: row.label,
    payload: row.payload ?? {},
    estimatedExpenses: row.estimated_expenses,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFutureTrip(
  row: FutureRow,
  wishlistItemIds: string[] = [],
  plans: FutureTripPlan[] = [],
): FutureTrip {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    status: row.status,
    potentialStart: row.potential_start,
    potentialEnd: row.potential_end,
    estimatedDurationDays: row.estimated_duration_days,
    travelers: row.travelers,
    budget: row.budget == null ? null : Number(row.budget),
    currency: row.currency,
    interests: row.interests ?? [],
    transport: row.transport,
    notes: row.notes,
    preferences: row.preferences ?? {},
    coverImageUrl: row.cover_image_url,
    convertedTripId: row.converted_trip_id,
    wishlistItemIds,
    plans,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchFutureTrips(supabase: SupabaseClient, ownerId: string) {
  const { data: trips, error } = await supabase
    .from("future_trips")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (trips as FutureRow[] | null) ?? [];
  if (!rows.length) return [] as FutureTrip[];

  const ids = rows.map((row) => row.id);
  const [{ data: links }, { data: plans }] = await Promise.all([
    supabase
      .from("future_trip_wishlist_items")
      .select("future_trip_id, wishlist_item_id")
      .in("future_trip_id", ids),
    supabase.from("future_trip_plans").select("*").in("future_trip_id", ids),
  ]);

  const linkMap = new Map<string, string[]>();
  for (const link of (links as LinkRow[] | null) ?? []) {
    const list = linkMap.get(link.future_trip_id) ?? [];
    list.push(link.wishlist_item_id);
    linkMap.set(link.future_trip_id, list);
  }
  const planMap = new Map<string, FutureTripPlan[]>();
  for (const plan of (plans as PlanRow[] | null) ?? []) {
    const list = planMap.get(plan.future_trip_id) ?? [];
    list.push(mapPlan(plan));
    planMap.set(plan.future_trip_id, list);
  }

  return rows.map((row) =>
    mapFutureTrip(row, linkMap.get(row.id) ?? [], planMap.get(row.id) ?? []),
  );
}
