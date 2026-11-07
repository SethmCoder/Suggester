import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WishlistCategory,
  WishlistCollection,
  WishlistItem,
  WishlistPriority,
} from "./types";

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  collection_id: string | null;
  name: string;
  location: string | null;
  description: string | null;
  category: WishlistCategory;
  source_url: string | null;
  external_place_id: string | null;
  photo_url: string | null;
  photo_attribution: string | null;
  estimated_price: string | null;
  notes: string | null;
  priority: WishlistPriority;
  lat: number | null;
  lng: number | null;
  address: string | null;
  associated_trip_id: string | null;
  associated_future_trip_id: string | null;
  saved_at: string;
  updated_at: string;
};

export function mapCollection(row: CollectionRow): WishlistCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapItem(row: ItemRow): WishlistItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    name: row.name,
    location: row.location,
    description: row.description,
    category: row.category,
    sourceUrl: row.source_url,
    externalPlaceId: row.external_place_id,
    photoUrl: row.photo_url,
    photoAttribution: row.photo_attribution,
    estimatedPrice: row.estimated_price,
    notes: row.notes,
    priority: row.priority,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    associatedTripId: row.associated_trip_id,
    associatedFutureTripId: row.associated_future_trip_id,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWishlist(supabase: SupabaseClient, ownerId: string) {
  const [{ data: collections, error: collectionError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from("wishlist_collections")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("wishlist_items")
        .select("*")
        .eq("owner_id", ownerId)
        .order("saved_at", { ascending: false }),
    ]);
  if (collectionError) throw collectionError;
  if (itemError) throw itemError;
  return {
    collections: (collections as CollectionRow[] | null)?.map(mapCollection) ?? [],
    items: (items as ItemRow[] | null)?.map(mapItem) ?? [],
  };
}
