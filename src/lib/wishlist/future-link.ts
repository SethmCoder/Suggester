import { listFutureTrips, updateFutureTrip } from "@/lib/future-trips/store";
import { saveFutureTrip } from "@/lib/future-trips/sync";
import type { FutureTrip } from "@/lib/future-trips/types";
import type { WishlistItem } from "@/lib/wishlist/types";
import { updateItem } from "@/lib/wishlist/store";
import { countryFromDestination } from "@/lib/destination-image";

/** Best-effort city token from a wishlist item. */
export function cityFromWishlistItem(item: WishlistItem): string | null {
  const raw =
    item.location?.trim() ||
    item.address?.split(",").slice(0, 2).join(",").trim() ||
    null;
  if (raw && raw.length >= 2) return raw.split(",")[0]!.trim();
  // Destination-category items often use the place name as the city.
  if (item.category === "destination" && item.name.trim().length >= 2) {
    return item.name.trim();
  }
  return null;
}

export function findFutureTripForCity(city: string): FutureTrip | null {
  const needle = city.trim();
  if (!needle) return null;
  const trips = listFutureTrips();
  return (
    trips.find((trip) =>
      trip.destination
        .split(/\s*(?:→|->|,|\/|\band\b|\+)\s*/i)
        .some((part) => placesOverlap(part, needle)),
    ) ?? null
  );
}

/**
 * Ensure a future trip exists for this wishlist city and attach the item.
 * Returns the linked future trip (created or existing).
 */
export async function ensureFutureTripForWishlistItem(
  item: WishlistItem,
): Promise<FutureTrip | null> {
  const city = cityFromWishlistItem(item);
  if (!city) return null;

  let trip = findFutureTripForCity(city);
  if (!trip) {
    trip = await saveFutureTrip({
      destination: city,
      title: city,
      status: "wishlist",
      preferences: {
        dreamer: { awaitingBookings: true, fromWishlist: true },
      },
      wishlistItemIds: [item.id],
    });
  } else if (!trip.wishlistItemIds.includes(item.id)) {
    updateFutureTrip(trip.id, {
      wishlistItemIds: [...trip.wishlistItemIds, item.id],
    });
    trip = listFutureTrips().find((t) => t.id === trip!.id) ?? trip;
  }

  updateItem(item.id, { associatedFutureTripId: trip.id });
  return trip;
}

function placesOverlap(a: string, b: string): boolean {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const leftCountry = countryFromDestination(a).toLowerCase();
  const rightCountry = countryFromDestination(b).toLowerCase();
  if (leftCountry === right || rightCountry === left) return true;
  if (
    leftCountry !== "destination" &&
    rightCountry !== "destination" &&
    leftCountry === rightCountry
  ) {
    return true;
  }
  return false;
}

/** Wishlist items that belong with a future trip (attached or city match). */
export function wishlistItemsForFutureTrip(
  trip: FutureTrip,
  items: WishlistItem[],
): WishlistItem[] {
  const cities = trip.destination
    .split(/\s*(?:→|->|,|\/|\band\b|\+)\s*/i)
    .map((c) => c.trim())
    .filter(Boolean);
  return items.filter((item) => {
    if (trip.wishlistItemIds.includes(item.id)) return true;
    if (item.associatedFutureTripId === trip.id) return true;
    const loc = item.location || item.address || item.name || "";
    return cities.some((city) => placesOverlap(city, loc));
  });
}
