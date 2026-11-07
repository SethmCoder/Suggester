import { NextResponse } from "next/server";
import { z } from "zod";
import { FUTURE_TRIP_STATUSES } from "@/lib/future-trips/types";
import { fetchFutureTrips, mapFutureTrip } from "@/lib/future-trips/server";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";

const bodySchema = z.object({
  title: z.string().max(160).optional(),
  destination: z.string().min(1).max(160),
  status: z.enum(FUTURE_TRIP_STATUSES).optional(),
  potentialStart: z.string().nullable().optional(),
  potentialEnd: z.string().nullable().optional(),
  estimatedDurationDays: z.number().int().min(1).max(60).nullable().optional(),
  travelers: z.number().int().min(1).max(30).nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  currency: z.string().max(8).optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
  transport: z.string().max(40).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  coverImageUrl: z.string().url().nullable().optional().or(z.literal("")),
  wishlistItemIds: z.array(z.string().uuid()).max(80).optional(),
});

export async function GET() {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) {
    return offlineJson({ trips: [] });
  }
  try {
    const trips = await fetchFutureTrips(auth.supabase, auth.user.id);
    return NextResponse.json({ offline: false, trips });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Future trips unavailable";
    return NextResponse.json({ offline: true, trips: [], error: message });
  }
}

export async function POST(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = bodySchema.parse(await req.json());
  const { data, error } = await auth.supabase
    .from("future_trips")
    .insert({
      owner_id: auth.user.id,
      title: body.title?.trim() || null,
      destination: body.destination.trim(),
      status: body.status ?? "wishlist",
      potential_start: body.potentialStart || null,
      potential_end: body.potentialEnd || null,
      estimated_duration_days: body.estimatedDurationDays ?? null,
      travelers: body.travelers ?? null,
      budget: body.budget ?? null,
      currency: body.currency || "USD",
      interests: body.interests ?? [],
      transport: body.transport ?? null,
      notes: body.notes ?? null,
      preferences: body.preferences ?? {},
      cover_image_url: body.coverImageUrl || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const itemIds = body.wishlistItemIds ?? [];
  if (itemIds.length) {
    await auth.supabase.from("future_trip_wishlist_items").insert(
      itemIds.map((wishlist_item_id) => ({
        future_trip_id: data.id,
        wishlist_item_id,
      })),
    );
  }

  return NextResponse.json({
    trip: mapFutureTrip(data, itemIds, []),
  });
}
