import { NextResponse } from "next/server";
import { z } from "zod";
import { WISHLIST_CATEGORIES } from "@/lib/wishlist/types";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";
import { mapItem } from "@/lib/wishlist/server";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  collectionId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.enum(WISHLIST_CATEGORIES).optional(),
  sourceUrl: z.string().url().nullable().optional().or(z.literal("")),
  externalPlaceId: z.string().max(200).nullable().optional(),
  photoUrl: z.string().url().nullable().optional().or(z.literal("")),
  photoAttribution: z.string().max(500).nullable().optional(),
  estimatedPrice: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  associatedTripId: z.string().uuid().nullable().optional(),
  associatedFutureTripId: z.string().uuid().nullable().optional(),
});

function toRow(body: z.infer<typeof itemSchema>, ownerId: string) {
  return {
    owner_id: ownerId,
    collection_id: body.collectionId ?? null,
    name: body.name.trim(),
    location: body.location ?? null,
    description: body.description ?? null,
    category: body.category ?? "custom",
    source_url: body.sourceUrl || null,
    external_place_id: body.externalPlaceId ?? null,
    photo_url: body.photoUrl || null,
    photo_attribution: body.photoAttribution ?? null,
    estimated_price: body.estimatedPrice ?? null,
    notes: body.notes ?? null,
    priority: body.priority ?? "medium",
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    address: body.address ?? null,
    associated_trip_id: body.associatedTripId ?? null,
    associated_future_trip_id: body.associatedFutureTripId ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = itemSchema.parse(await req.json());

  if (body.externalPlaceId) {
    const { data: existing } = await auth.supabase
      .from("wishlist_items")
      .select("*")
      .eq("owner_id", auth.user.id)
      .eq("external_place_id", body.externalPlaceId)
      .maybeSingle();
    if (existing) {
      const { data, error } = await auth.supabase
        .from("wishlist_items")
        .update(toRow(body, auth.user.id))
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ item: mapItem(data), updated: true });
    }
  }

  const { data, error } = await auth.supabase
    .from("wishlist_items")
    .insert(toRow(body, auth.user.id))
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: mapItem(data), updated: false });
}

export async function PATCH(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = itemSchema.extend({ id: z.string().uuid() }).parse(await req.json());
  const { data, error } = await auth.supabase
    .from("wishlist_items")
    .update(toRow(body, auth.user.id))
    .eq("id", body.id)
    .eq("owner_id", auth.user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: mapItem(data) });
}

export async function DELETE(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await auth.supabase
    .from("wishlist_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
