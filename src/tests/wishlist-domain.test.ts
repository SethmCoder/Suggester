import { beforeEach, describe, expect, it } from "vitest";
import {
  createCollection,
  deleteCollection,
  listCollections,
  listItems,
  moveItem,
  removeItem,
  replaceWishlistState,
  updateItem,
  upsertItem,
} from "@/lib/wishlist/store";
import { PLAN_LIMITS } from "@/lib/billing/limits";
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
});

describe("wishlist domain", () => {
  it("creates a collection with a name", () => {
    const row = createCollection({ name: "Japan" });
    expect(row.name).toBe("Japan");
    expect(listCollections()).toHaveLength(1);
  });

  it("creates up to the Free collection soft-cap count locally", () => {
    for (let i = 0; i < PLAN_LIMITS.free.wishlistCollections; i++) {
      createCollection({ name: `C${i}` });
    }
    expect(listCollections()).toHaveLength(PLAN_LIMITS.free.wishlistCollections);
  });

  it("upserts an attraction with category and location", () => {
    const item = upsertItem({
      name: "Sagrada Familia",
      location: "Barcelona",
      category: "attraction",
      priority: "high",
    });
    expect(item.category).toBe("attraction");
    expect(listItems()[0]?.location).toBe("Barcelona");
  });

  it("updates notes and priority without losing the name", () => {
    const item = upsertItem({ name: "Louvre", category: "museum" });
    updateItem(item.id, { notes: "Morning", priority: "high" });
    expect(listItems()[0]).toMatchObject({
      name: "Louvre",
      notes: "Morning",
      priority: "high",
    });
  });

  it("removes an item and leaves other items intact", () => {
    const a = upsertItem({ name: "A", category: "custom" });
    upsertItem({ name: "B", category: "custom" });
    removeItem(a.id);
    expect(listItems().map((row) => row.name)).toEqual(["B"]);
  });

  it("moves an item between collections", () => {
    const one = createCollection({ name: "One" });
    const two = createCollection({ name: "Two" });
    const item = upsertItem({
      name: "Cafe",
      category: "cafe",
      collectionId: one.id,
    });
    moveItem(item.id, two.id);
    expect(listItems()[0]?.collectionId).toBe(two.id);
  });

  it("deletes a collection without deleting unrelated items", () => {
    const keep = createCollection({ name: "Keep" });
    const drop = createCollection({ name: "Drop" });
    upsertItem({ name: "Stay", category: "custom", collectionId: keep.id });
    upsertItem({ name: "Gone collection", category: "custom", collectionId: drop.id });
    deleteCollection(drop.id);
    expect(listCollections().map((row) => row.name)).toEqual(["Keep"]);
  });

  it("records a wishlist_save intelligence signal for museums", () => {
    const next = applySignal(emptyIntelligence(), {
      type: "wishlist_save",
      category: "museum",
      name: "Louvre",
    });
    expect(next.inferred.interests.some((row) => row.interest === "museums")).toBe(
      true,
    );
  });

  it("records a wishlist_remove signal that soft-reduces weight", () => {
    let profile = applySignal(emptyIntelligence(), {
      type: "wishlist_save",
      category: "museum",
    });
    const before = profile.inferred.interests[0]?.weight ?? 0;
    profile = applySignal(profile, { type: "wishlist_remove", category: "museum" });
    expect(profile.inferred.interests[0]?.weight ?? 0).toBeLessThan(before);
  });

  it("replaceWishlistState restores a remote snapshot", () => {
    replaceWishlistState({
      collections: [
        {
          id: "c1",
          name: "Remote",
          description: null,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      items: [
        {
          id: "i1",
          collectionId: "c1",
          name: "Remote place",
          location: "Rome",
          description: null,
          category: "attraction",
          sourceUrl: null,
          externalPlaceId: null,
          photoUrl: null,
          photoAttribution: null,
          estimatedPrice: null,
          notes: null,
          priority: "medium",
          lat: null,
          lng: null,
          address: null,
          associatedTripId: null,
          associatedFutureTripId: null,
          savedAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
    });
    expect(listCollections()).toHaveLength(1);
    expect(listItems()[0]?.name).toBe("Remote place");
  });
});
