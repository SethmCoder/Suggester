import { NextResponse } from "next/server";
import { z } from "zod";
import { FUTURE_TRIP_STATUSES } from "@/lib/future-trips/types";
import { fetchFutureTrips, mapFutureTrip, mapPlan } from "@/lib/future-trips/server";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";

const patchSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  destination: z.string().min(1).max(160).optional(),
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
  convertedTripId: z.string().uuid().nullable().optional(),
  plan: z
    .object({
      label: z.string().max(80).optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
      estimatedExpenses: z.string().max(500).nullable().optional(),
    })
    .optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const trips = await fetchFutureTrips(auth.supabase, auth.user.id);
  const trip = trips.find((item) => item.id === id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ trip, offline: false });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = patchSchema.parse(await req.json());

  const { data, error } = await auth.supabase
    .from("future_trips")
    .update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.destination ? { destination: body.destination.trim() } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.potentialStart !== undefined
        ? { potential_start: body.potentialStart }
        : {}),
      ...(body.potentialEnd !== undefined ? { potential_end: body.potentialEnd } : {}),
      ...(body.estimatedDurationDays !== undefined
        ? { estimated_duration_days: body.estimatedDurationDays }
        : {}),
      ...(body.travelers !== undefined ? { travelers: body.travelers } : {}),
      ...(body.budget !== undefined ? { budget: body.budget } : {}),
      ...(body.currency ? { currency: body.currency } : {}),
      ...(body.interests ? { interests: body.interests } : {}),
      ...(body.transport !== undefined ? { transport: body.transport } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.preferences ? { preferences: body.preferences } : {}),
      ...(body.coverImageUrl !== undefined
        ? { cover_image_url: body.coverImageUrl || null }
        : {}),
      ...(body.convertedTripId !== undefined
        ? { converted_trip_id: body.convertedTripId }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.wishlistItemIds) {
    await auth.supabase.from("future_trip_wishlist_items").delete().eq("future_trip_id", id);
    if (body.wishlistItemIds.length) {
      await auth.supabase.from("future_trip_wishlist_items").insert(
        body.wishlistItemIds.map((wishlist_item_id) => ({
          future_trip_id: id,
          wishlist_item_id,
        })),
      );
    }
  }

  let plans = undefined;
  if (body.plan) {
    const { data: plan, error: planError } = await auth.supabase
      .from("future_trip_plans")
      .insert({
        future_trip_id: id,
        label: body.plan.label || "Draft",
        payload: body.plan.payload ?? {},
        estimated_expenses: body.plan.estimatedExpenses ?? null,
      })
      .select("*")
      .single();
    if (planError) return NextResponse.json({ error: planError.message }, { status: 400 });
    plans = [mapPlan(plan)];
  }

  const trips = await fetchFutureTrips(auth.supabase, auth.user.id);
  const trip = trips.find((item) => item.id === id) ?? mapFutureTrip(
    data,
    body.wishlistItemIds,
    plans,
  );
  return NextResponse.json({ trip });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const { error } = await auth.supabase
    .from("future_trips")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
