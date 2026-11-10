/**
 * Client-side trip persistence for offline / demo use.
 * Survives reloads without network; synced to server when PATCH succeeds.
 */

import type { ActivityRow, TripLeg, TripListItem } from "@/lib/types/trip";
import type { TripExpense } from "@/lib/trips/expenses";

const INDEX_KEY = "waypoint:offline-trips-index-v1";
const SNAPSHOT_PREFIX = "waypoint:offline-trip:";
const HIDDEN_KEY = "waypoint:hidden-trips";

export type OfflineDay = { id: string; day_index: number };

export type OfflineTripSnapshot = {
  trip: TripListItem & { status?: string };
  days: OfflineDay[];
  activities: ActivityRow[];
  updatedAt: string;
  offlineOnly?: boolean;
  /** Demo payload version — ignore stale local copies when bumped. */
  contentVersion?: number;
  /** Multi-city stays with hotels + place-to-place transit. */
  legs?: TripLeg[];
  budget?: {
    total?: number;
    currency?: string;
    allocation?: "sights" | "food" | "getting-around" | "mostly-free";
    restaurantStyle?: "street" | "casual" | "sit-down" | "mix";
  };
  /** Purchases logged against the trip budget. */
  expenses?: TripExpense[];
};

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set(ids)]));
}

export function saveOfflineTrip(snapshot: OfflineTripSnapshot) {
  const id = snapshot.trip.id;
  const next: OfflineTripSnapshot = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${SNAPSHOT_PREFIX}${id}`, JSON.stringify(next));
  const index = readIndex();
  if (!index.includes(id)) writeIndex([id, ...index]);
  else writeIndex(index);
}

export function loadOfflineTrip(id: string): OfflineTripSnapshot | null {
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as OfflineTripSnapshot;
  } catch {
    return null;
  }
}

/** Trips the traveler created. Sample itineraries are not counted toward the free plan. */
export function countCreatedOfflineTrips(): number {
  return readIndex().filter((id) => id.startsWith("offline-")).length;
}

export function listOfflineTrips(): TripListItem[] {
  return readIndex()
    .map((id) => loadOfflineTrip(id)?.trip)
    .filter((t): t is TripListItem => Boolean(t))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export function removeOfflineTrip(id: string) {
  localStorage.removeItem(`${SNAPSHOT_PREFIX}${id}`);
  writeIndex(readIndex().filter((x) => x !== id));
}

export function hiddenTripIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/** Drop the on-device copy and keep sample trips from being seeded again. */
export function hideTripLocally(id: string) {
  removeOfflineTrip(id);
  const ids = hiddenTripIds();
  if (!ids.includes(id)) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids, id]));
  }
}

/** Persist day groups from the itinerary editor. */
export function saveOfflineDayGroups(
  tripId: string,
  destination: string,
  days: {
    dayId: string;
    dayIndex: number;
    activities: ActivityRow[];
  }[],
  meta?: Partial<TripListItem>,
) {
  const existing = loadOfflineTrip(tripId);
  const activities = days.flatMap((d) =>
    d.activities.map((a, i) => ({
      ...a,
      day_id: d.dayId,
      sort_order: a.sort_order ?? i,
    })),
  );
  saveOfflineTrip({
    trip: {
      id: tripId,
      destination: existing?.trip.destination ?? destination,
      start_date: existing?.trip.start_date ?? meta?.start_date ?? "",
      end_date: existing?.trip.end_date ?? meta?.end_date ?? "",
      cover_image_url:
        existing?.trip.cover_image_url ?? meta?.cover_image_url ?? null,
      created_at:
        existing?.trip.created_at ??
        meta?.created_at ??
        new Date().toISOString(),
      day_count: days.length,
      ...meta,
    },
    days: days.map((d) => ({ id: d.dayId, day_index: d.dayIndex })),
    activities,
    updatedAt: new Date().toISOString(),
    offlineOnly: existing?.offlineOnly,
    contentVersion: existing?.contentVersion,
    legs: existing?.legs,
    budget: existing?.budget,
    expenses: existing?.expenses,
  });
}

/** Merge expense rows into the on-device trip snapshot. */
export function saveOfflineExpenses(tripId: string, expenses: TripExpense[]) {
  const existing = loadOfflineTrip(tripId);
  if (!existing) return;
  saveOfflineTrip({
    ...existing,
    expenses,
  });
}

export function createOfflineTripId() {
  return `offline-${crypto.randomUUID()}`;
}
