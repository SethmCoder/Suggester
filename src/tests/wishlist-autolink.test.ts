import { beforeEach, describe, expect, it } from "vitest";
import {
  cityFromWishlistItem,
  findFutureTripForCity,
  wishlistItemsForFutureTrip,
} from "@/lib/wishlist/future-link";
import { replaceWishlistState, upsertItem } from "@/lib/wishlist/store";
import { replaceFutureTrips } from "@/lib/future-trips/store";
import type { FutureTrip } from "@/lib/future-trips/types";
import { splitDestinationCities } from "@/components/dreamer/SegmentedCityHero";

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

function blankTrip(partial: Partial<FutureTrip> & { destination: string }): FutureTrip {
  const stamp = new Date().toISOString();
  return {
    id: partial.id ?? "ft-1",
    title: partial.title ?? partial.destination,
    destination: partial.destination,
    status: partial.status ?? "wishlist",
    interests: [],
    preferences: {},
    wishlistItemIds: partial.wishlistItemIds ?? [],
    plans: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe("wishlist ↔ future trip linking helpers", () => {
  beforeEach(() => {
    mockStorage();
    replaceWishlistState({ collections: [], items: [] });
    replaceFutureTrips([]);
  });

  it("splits multi-city destinations for collage heroes", () => {
    expect(splitDestinationCities("Tokyo → Kyoto")).toEqual(["Tokyo", "Kyoto"]);
    expect(splitDestinationCities("Munich and London")).toEqual([
      "Munich",
      "London",
    ]);
  });

  it("resolves city from wishlist location", () => {
    const item = upsertItem({
      name: "Tokyo Tower",
      location: "Tokyo, Japan",
      category: "attraction",
    });
    expect(cityFromWishlistItem(item)).toBe("Tokyo");
  });

  it("finds an existing future trip by city", () => {
    replaceFutureTrips([blankTrip({ id: "ft-tokyo", destination: "Tokyo" })]);
    expect(findFutureTripForCity("Tokyo")?.id).toBe("ft-tokyo");
  });

  it("lists wishlist items for a future trip by city match", () => {
    const trip = blankTrip({ id: "ft-jp", destination: "Japan" });
    const tower = upsertItem({
      name: "Tokyo Tower",
      location: "Tokyo",
      category: "attraction",
    });
    const matched = wishlistItemsForFutureTrip(trip, [tower]);
    expect(matched.map((i) => i.name)).toContain("Tokyo Tower");
  });
});
