import type { FutureTrip, FutureTripInput } from "./types";
import * as store from "./store";

export async function loadFutureTrips(): Promise<{
  trips: FutureTrip[];
  source: "remote" | "local" | "merged";
}> {
  const local = store.listFutureTrips();
  try {
    const res = await fetch("/api/future-trips");
    if (!res.ok) return { trips: local, source: "local" };
    const data = (await res.json()) as {
      offline?: boolean;
      trips?: FutureTrip[];
    };
    if (data.offline || !data.trips) return { trips: local, source: "local" };
    const byId = new Map(local.map((trip) => [trip.id, trip]));
    for (const trip of data.trips) byId.set(trip.id, trip);
    const trips = [...byId.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    store.replaceFutureTrips(trips);
    return {
      trips,
      source: data.trips.length ? "merged" : "local",
    };
  } catch {
    return { trips: local, source: "local" };
  }
}

export async function saveFutureTrip(input: FutureTripInput): Promise<FutureTrip> {
  const local = store.createFutureTrip(input);
  void import("@/lib/intelligence/sync")
    .then(({ postIntelligenceSignal }) =>
      postIntelligenceSignal({
        type: "future_trip_create",
        destination: input.destination,
        interests: input.interests,
      }),
    )
    .catch(() => undefined);
  try {
    const res = await fetch("/api/future-trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as { offline?: boolean; trip?: FutureTrip };
    if (data.offline || !data.trip) return local;
    store.deleteFutureTrip(local.id);
    store.replaceFutureTrips([data.trip, ...store.listFutureTrips()]);
    return data.trip;
  } catch {
    return local;
  }
}

export async function patchFutureTrip(
  id: string,
  patch: Partial<FutureTripInput> & { convertedTripId?: string | null; plan?: unknown },
): Promise<FutureTrip | null> {
  const local = store.updateFutureTrip(id, patch);
  try {
    const res = await fetch(`/api/future-trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as { offline?: boolean; trip?: FutureTrip };
    if (data.trip && !data.offline) {
      store.replaceFutureTrips(
        store.listFutureTrips().map((trip) => (trip.id === id ? data.trip! : trip)),
      );
      return data.trip;
    }
  } catch {
    /* keep local */
  }
  return local;
}

export async function removeFutureTrip(id: string) {
  store.deleteFutureTrip(id);
  try {
    const { clearDreamerBookings } = await import(
      "@/lib/dreamer/bookings-store"
    );
    clearDreamerBookings(id);
  } catch {
    /* offline / SSR */
  }
  try {
    await fetch(`/api/future-trips/${id}`, { method: "DELETE" });
  } catch {
    /* local already removed */
  }
}

export async function startPlanning(id: string): Promise<{
  redirect: string;
  alreadyConverted?: boolean;
  tripId?: string;
}> {
  try {
    const res = await fetch(`/api/future-trips/${id}/start`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as {
        redirect?: string;
        alreadyConverted?: boolean;
        tripId?: string;
        offline?: boolean;
      };
      if (data.redirect) return data as { redirect: string; alreadyConverted?: boolean; tripId?: string };
    }
  } catch {
    /* fall through */
  }
  store.updateFutureTrip(id, { status: "planning" });
  return { redirect: `/trips/new?future=${id}` };
}
