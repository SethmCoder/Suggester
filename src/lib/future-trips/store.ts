import type {
  FutureTrip,
  FutureTripInput,
  FutureTripPlan,
  FutureTripStatus,
} from "./types";

const KEY = "waypoint:future-trips-v1";

function now() {
  return new Date().toISOString();
}

function id(prefix = "future") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): FutureTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FutureTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(trips: FutureTrip[]) {
  localStorage.setItem(KEY, JSON.stringify(trips));
}

export function listFutureTrips(): FutureTrip[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getFutureTrip(tripId: string): FutureTrip | null {
  return readAll().find((trip) => trip.id === tripId) ?? null;
}

export function createFutureTrip(input: FutureTripInput): FutureTrip {
  const stamp = now();
  const trip: FutureTrip = {
    id: id(),
    title: input.title?.trim() || null,
    destination: input.destination.trim(),
    status: (input.status as FutureTripStatus) || "wishlist",
    potentialStart: input.potentialStart || null,
    potentialEnd: input.potentialEnd || null,
    estimatedDurationDays: input.estimatedDurationDays ?? null,
    travelers: input.travelers ?? null,
    budget: input.budget ?? null,
    currency: input.currency || "USD",
    interests: input.interests ?? [],
    transport: input.transport || null,
    notes: input.notes || null,
    preferences: input.preferences ?? {},
    coverImageUrl: input.coverImageUrl || null,
    convertedTripId: input.convertedTripId || null,
    wishlistItemIds: input.wishlistItemIds ?? [],
    plans: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  writeAll([trip, ...readAll()]);
  return trip;
}

export function updateFutureTrip(
  tripId: string,
  patch: Partial<FutureTripInput> & {
    convertedTripId?: string | null;
    plans?: FutureTripPlan[];
  },
): FutureTrip | null {
  const next = readAll().map((trip) => {
    if (trip.id !== tripId) return trip;
    return {
      ...trip,
      ...patch,
      destination: patch.destination?.trim() || trip.destination,
      title: patch.title === undefined ? trip.title : patch.title?.trim() || null,
      interests: patch.interests ?? trip.interests,
      wishlistItemIds: patch.wishlistItemIds ?? trip.wishlistItemIds,
      preferences: patch.preferences ?? trip.preferences,
      plans: patch.plans ?? trip.plans,
      updatedAt: now(),
    };
  });
  writeAll(next);
  return next.find((trip) => trip.id === tripId) ?? null;
}

export function deleteFutureTrip(tripId: string) {
  writeAll(readAll().filter((trip) => trip.id !== tripId));
}

export function attachWishlistItem(tripId: string, itemId: string): FutureTrip | null {
  const trip = getFutureTrip(tripId);
  if (!trip) return null;
  if (trip.wishlistItemIds.includes(itemId)) return trip;
  return updateFutureTrip(tripId, {
    wishlistItemIds: [...trip.wishlistItemIds, itemId],
  });
}

export function detachWishlistItem(tripId: string, itemId: string): FutureTrip | null {
  const trip = getFutureTrip(tripId);
  if (!trip) return null;
  return updateFutureTrip(tripId, {
    wishlistItemIds: trip.wishlistItemIds.filter((id) => id !== itemId),
  });
}

export function addPlan(
  tripId: string,
  input: { label?: string; payload?: Record<string, unknown>; estimatedExpenses?: string },
): FutureTripPlan | null {
  const trip = getFutureTrip(tripId);
  if (!trip) return null;
  const stamp = now();
  const plan: FutureTripPlan = {
    id: id("plan"),
    futureTripId: tripId,
    label: input.label?.trim() || `Option ${trip.plans.length + 1}`,
    payload: input.payload ?? {},
    estimatedExpenses: input.estimatedExpenses ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  updateFutureTrip(tripId, { plans: [plan, ...trip.plans] });
  return plan;
}

export function replaceFutureTrips(trips: FutureTrip[]) {
  writeAll(trips);
}
