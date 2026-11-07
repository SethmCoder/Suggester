import { beforeEach, describe, expect, it } from "vitest";
import {
  createFutureTrip,
  getFutureTrip,
  updateFutureTrip,
  attachWishlistItem,
} from "@/lib/future-trips/store";
import {
  createCollection,
  listCollections,
  listItems,
  upsertItem,
  updateItem,
  removeItem,
  itemsForDestination,
  replaceWishlistState,
} from "@/lib/wishlist/store";

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
});

describe("wishlist and future trips offline store", () => {
  it("creates multiple collections and keeps items after edits", () => {
    const japan = createCollection({ name: "Japan wishlist" });
    const food = createCollection({ name: "Restaurants to try" });
    expect(listCollections()).toHaveLength(2);

    const item = upsertItem({
      name: "TeamLab Planets",
      location: "Tokyo",
      category: "museum",
      collectionId: japan.id,
      priority: "high",
    });
    upsertItem({
      name: "Ichiran",
      location: "Tokyo",
      category: "restaurant",
      collectionId: food.id,
    });
    updateItem(item.id, { notes: "Night visit" });
    expect(listItems()).toHaveLength(2);
    expect(listItems().find((row) => row.id === item.id)?.notes).toBe("Night visit");
    removeItem(item.id);
    expect(listItems()).toHaveLength(1);
    expect(listCollections().map((row) => row.name)).toContain("Japan wishlist");
  });

  it("creates future trips without exact dates and links wishlist items", () => {
    const saved = upsertItem({
      name: "Louvre",
      location: "Paris",
      category: "museum",
    });
    const trip = createFutureTrip({
      destination: "Paris",
      title: "Spring idea",
      estimatedDurationDays: 4,
      travelers: 2,
    });
    expect(trip.potentialStart).toBeNull();
    expect(trip.potentialEnd).toBeNull();
    attachWishlistItem(trip.id, saved.id);
    const linked = getFutureTrip(trip.id);
    expect(linked?.wishlistItemIds).toContain(saved.id);
    expect(itemsForDestination("Paris").map((item) => item.name)).toContain("Louvre");
  });

  it("converts a future trip by marking convertedTripId without deleting the project", () => {
    const trip = createFutureTrip({ destination: "Lisbon", status: "planning" });
    updateFutureTrip(trip.id, {
      convertedTripId: "offline-active-1",
      status: "ready",
    });
    const kept = getFutureTrip(trip.id);
    expect(kept?.convertedTripId).toBe("offline-active-1");
    expect(kept?.destination).toBe("Lisbon");
    expect(kept?.status).toBe("ready");
  });
});
