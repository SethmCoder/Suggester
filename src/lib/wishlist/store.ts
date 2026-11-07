import { readSavedPlaces } from "@/lib/places/saved-places";
import type {
  WishlistCategory,
  WishlistCollection,
  WishlistItem,
  WishlistItemInput,
  WishlistPriority,
} from "./types";

const COLLECTIONS_KEY = "waypoint:wishlist-collections-v1";
const ITEMS_KEY = "waypoint:wishlist-items-v1";
const MIGRATED_KEY = "waypoint:wishlist-migrated-v1";

function now() {
  return new Date().toISOString();
}

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function migrateLegacyPlaces() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY)) return;
  const existing = readJson<WishlistItem[]>(ITEMS_KEY, []);
  if (existing.length) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }
  const legacy = readSavedPlaces();
  if (!legacy.length) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }
  const migrated: WishlistItem[] = legacy.map((place) => ({
    id: place.id.startsWith("wl-") ? place.id : `legacy-${place.id}`,
    name: place.name,
    location: place.address?.split(",").slice(-2).join(",").trim() || null,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: "attraction" as WishlistCategory,
    priority: "medium" as WishlistPriority,
    savedAt: place.savedAt || now(),
    updatedAt: place.savedAt || now(),
  }));
  writeJson(ITEMS_KEY, migrated);
  localStorage.setItem(MIGRATED_KEY, "1");
}

export function listCollections(): WishlistCollection[] {
  migrateLegacyPlaces();
  return readJson<WishlistCollection[]>(COLLECTIONS_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function createCollection(input: {
  name: string;
  description?: string;
}): WishlistCollection {
  migrateLegacyPlaces();
  const stamp = now();
  const collection: WishlistCollection = {
    id: id(),
    name: input.name.trim() || "Untitled collection",
    description: input.description?.trim() || null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  writeJson(COLLECTIONS_KEY, [collection, ...listCollections()]);
  return collection;
}

export function updateCollection(
  collectionId: string,
  patch: Partial<Pick<WishlistCollection, "name" | "description">>,
): WishlistCollection | null {
  const next = listCollections().map((collection) =>
    collection.id === collectionId
      ? {
          ...collection,
          ...patch,
          name: patch.name?.trim() || collection.name,
          updatedAt: now(),
        }
      : collection,
  );
  writeJson(COLLECTIONS_KEY, next);
  return next.find((collection) => collection.id === collectionId) ?? null;
}

export function deleteCollection(collectionId: string) {
  writeJson(
    COLLECTIONS_KEY,
    listCollections().filter((collection) => collection.id !== collectionId),
  );
  writeJson(
    ITEMS_KEY,
    listItems().map((item) =>
      item.collectionId === collectionId
        ? { ...item, collectionId: null, updatedAt: now() }
        : item,
    ),
  );
}

export function listItems(): WishlistItem[] {
  migrateLegacyPlaces();
  return readJson<WishlistItem[]>(ITEMS_KEY, []).sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  );
}

export function getItem(itemId: string): WishlistItem | null {
  return listItems().find((item) => item.id === itemId) ?? null;
}

export function upsertItem(input: WishlistItemInput): WishlistItem {
  migrateLegacyPlaces();
  const stamp = now();
  const items = listItems();
  const externalKey = input.externalPlaceId?.trim();
  const dedupe =
    (externalKey &&
      items.find((item) => item.externalPlaceId === externalKey)) ||
    items.find(
      (item) =>
        item.name.toLowerCase() === input.name.trim().toLowerCase() &&
        (input.lat == null ||
          (item.lat != null &&
            Math.abs(item.lat - input.lat) < 0.0005 &&
            item.lng != null &&
            input.lng != null &&
            Math.abs(item.lng - input.lng) < 0.0005)),
    );

  if (dedupe) {
    const updated: WishlistItem = {
      ...dedupe,
      ...input,
      name: input.name.trim(),
      category: input.category ?? dedupe.category,
      priority: input.priority ?? dedupe.priority,
      updatedAt: stamp,
    };
    writeJson(
      ITEMS_KEY,
      items.map((item) => (item.id === dedupe.id ? updated : item)),
    );
    return updated;
  }

  const created: WishlistItem = {
    id: id(),
    collectionId: input.collectionId ?? null,
    name: input.name.trim(),
    location: input.location ?? null,
    description: input.description ?? null,
    category: input.category ?? "custom",
    sourceUrl: input.sourceUrl ?? null,
    externalPlaceId: input.externalPlaceId ?? null,
    photoUrl: input.photoUrl ?? null,
    photoAttribution: input.photoAttribution ?? null,
    estimatedPrice: input.estimatedPrice ?? null,
    notes: input.notes ?? null,
    priority: input.priority ?? "medium",
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    address: input.address ?? null,
    associatedTripId: input.associatedTripId ?? null,
    associatedFutureTripId: input.associatedFutureTripId ?? null,
    savedAt: stamp,
    updatedAt: stamp,
  };
  writeJson(ITEMS_KEY, [created, ...items]);
  return created;
}

export function updateItem(
  itemId: string,
  patch: Partial<WishlistItemInput>,
): WishlistItem | null {
  const items = listItems();
  const next = items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          ...patch,
          name: patch.name?.trim() || item.name,
          updatedAt: now(),
        }
      : item,
  );
  writeJson(ITEMS_KEY, next);
  return next.find((item) => item.id === itemId) ?? null;
}

export function removeItem(itemId: string) {
  writeJson(
    ITEMS_KEY,
    listItems().filter((item) => item.id !== itemId),
  );
}

export function moveItem(itemId: string, collectionId: string | null) {
  return updateItem(itemId, { collectionId });
}

export function itemsForDestination(destination: string): WishlistItem[] {
  const needle = destination.trim().toLowerCase();
  if (!needle) return [];
  return listItems().filter((item) => {
    const hay = `${item.location ?? ""} ${item.address ?? ""} ${item.name}`.toLowerCase();
    return hay.includes(needle) || needle.includes((item.location ?? "").toLowerCase());
  });
}

export function replaceWishlistState(input: {
  collections: WishlistCollection[];
  items: WishlistItem[];
}) {
  writeJson(COLLECTIONS_KEY, input.collections);
  writeJson(ITEMS_KEY, input.items);
  localStorage.setItem(MIGRATED_KEY, "1");
}
