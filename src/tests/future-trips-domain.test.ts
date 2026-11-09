import { beforeEach, describe, expect, it } from "vitest";
import {
  attachWishlistItem,
  createFutureTrip,
  deleteFutureTrip,
  detachWishlistItem,
  getFutureTrip,
  listFutureTrips,
  replaceFutureTrips,
  updateFutureTrip,
} from "@/lib/future-trips/store";
import {
  replaceWishlistState,
  upsertItem,
} from "@/lib/wishlist/store";
import { applySignal } from "@/lib/intelligence/derive";
import { emptyIntelligence } from "@/lib/intelligence/types";

function mockStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
  });
}

beforeEach(() => {
  mockStorage();
  replaceWishlistState({ collections: [], items: [] });
  replaceFutureTrips([]);
});

describe("future trips domain", () => {
  it("creates a future trip without exact dates", () => {
    const trip = createFutureTrip({ destination: "Lisbon" });
    expect(trip.potentialStart).toBeNull();
    expect(trip.status).toBe("wishlist");
  });

  it("lists trips newest-first by updatedAt", () => {
    createFutureTrip({ destination: "A" });
    createFutureTrip({ destination: "B" });
    expect(listFutureTrips().map((trip) => trip.destination)).toEqual(["B", "A"]);
  });

  it("updates notes and budget on a project", () => {
    const trip = createFutureTrip({ destination: "Rome" });
    updateFutureTrip(trip.id, { notes: "Spring", budget: 2500 });
    expect(getFutureTrip(trip.id)).toMatchObject({ notes: "Spring", budget: 2500 });
  });

  it("links and unlinks wishlist items", () => {
    const item = upsertItem({ name: "Forum", location: "Rome", category: "attraction" });
    const trip = createFutureTrip({ destination: "Rome" });
    attachWishlistItem(trip.id, item.id);
    expect(getFutureTrip(trip.id)?.wishlistItemIds).toContain(item.id);
    detachWishlistItem(trip.id, item.id);
    expect(getFutureTrip(trip.id)?.wishlistItemIds).not.toContain(item.id);
  });

  it("marks conversion without deleting the research project", () => {
    const trip = createFutureTrip({ destination: "Kyoto", status: "planning" });
    updateFutureTrip(trip.id, {
      convertedTripId: "trip-123",
      status: "ready",
    });
    expect(getFutureTrip(trip.id)?.convertedTripId).toBe("trip-123");
    expect(listFutureTrips()).toHaveLength(1);
  });

  it("deletes a future trip project", () => {
    const trip = createFutureTrip({ destination: "Oslo" });
    deleteFutureTrip(trip.id);
    expect(getFutureTrip(trip.id)).toBeNull();
  });

  it("stores interests and duration estimates", () => {
    const trip = createFutureTrip({
      destination: "Seoul",
      interests: ["food", "history"],
      estimatedDurationDays: 6,
      travelers: 2,
    });
    expect(trip.interests).toEqual(["food", "history"]);
    expect(trip.estimatedDurationDays).toBe(6);
  });

  it("records a future_trip_create intelligence signal", () => {
    const next = applySignal(emptyIntelligence(), {
      type: "future_trip_create",
      destination: "Tokyo",
      interests: ["food"],
    });
    expect(next.inferred.preferredDestinations[0]).toBe("Tokyo");
    expect(next.inferred.interests.some((row) => row.interest === "food")).toBe(true);
  });

  it("supports researching status progression", () => {
    const trip = createFutureTrip({ destination: "Athens", status: "wishlist" });
    updateFutureTrip(trip.id, { status: "researching" });
    updateFutureTrip(trip.id, { status: "planning" });
    expect(getFutureTrip(trip.id)?.status).toBe("planning");
  });

  it("replaceFutureTrips restores remote projects", () => {
    replaceFutureTrips([
      {
        id: "ft1",
        title: "Idea",
        destination: "Porto",
        status: "wishlist",
        potentialStart: null,
        potentialEnd: null,
        estimatedDurationDays: 4,
        travelers: 2,
        budget: null,
        currency: null,
        interests: [],
        transport: null,
        notes: null,
        preferences: {},
        coverImageUrl: null,
        convertedTripId: null,
        wishlistItemIds: [],
        plans: [],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    ]);
    expect(listFutureTrips()[0]?.destination).toBe("Porto");
  });
});
