import { NextResponse } from "next/server";
import { fetchFutureTrips } from "@/lib/future-trips/server";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";
import { fetchWishlist } from "@/lib/wishlist/server";

/**
 * Prepares Start Planning payload for the existing trip wizard.
 * Does not create a duplicate trip here — conversion happens once in create,
 * keyed by future trip id. If already converted, returns that trip id.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) {
    return offlineJson({ redirect: `/trips/new?future=${id}` });
  }

  const trips = await fetchFutureTrips(auth.supabase, auth.user.id);
  const trip = trips.find((item) => item.id === id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (trip.convertedTripId) {
    return NextResponse.json({
      alreadyConverted: true,
      tripId: trip.convertedTripId,
      redirect: `/trips/${trip.convertedTripId}`,
    });
  }

  const wishlist = await fetchWishlist(auth.supabase, auth.user.id);
  const items = wishlist.items.filter((item) => trip.wishlistItemIds.includes(item.id));
  const mustSee = items
    .filter((item) => item.priority === "high")
    .map((item) => item.name);
  const preferred = items
    .filter((item) => item.priority !== "high")
    .map((item) => item.name);

  await auth.supabase
    .from("future_trips")
    .update({ status: "planning", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  return NextResponse.json({
    alreadyConverted: false,
    redirect: `/trips/new?future=${id}`,
    draft: {
      destination: trip.destination,
      title: trip.title,
      startDate: trip.potentialStart,
      endDate: trip.potentialEnd,
      estimatedDurationDays: trip.estimatedDurationDays,
      travelers: trip.travelers,
      budget: trip.budget,
      currency: trip.currency,
      interests: trip.interests,
      transport: trip.transport,
      notes: trip.notes,
      preferences: trip.preferences,
      mustSee,
      preferred,
      wishlistItemIds: trip.wishlistItemIds,
      futureTripId: trip.id,
    },
  });
}
