import { createServiceClient } from "../supabase/server";
import type { PlaceDetails } from "./places";

const TTL_MS = 30 * 24 * 3_600_000;
const memPlace = new Map<string, { at: number; data: PlaceDetails }>();
const memRoute = new Map<string, { at: number; data: unknown }>();

export async function getCachedPlaceDetails(
  placeId: string,
): Promise<PlaceDetails | null> {
  const mem = memPlace.get(placeId);
  if (mem && Date.now() - mem.at < TTL_MS) return mem.data;

  const supabase = createServiceClient();
  if (!supabase) return mem?.data ?? null;

  const { data } = await supabase
    .from("place_cache")
    .select("payload, retrieved_at")
    .eq("place_id", placeId)
    .maybeSingle();

  if (!data) return null;
  const age = Date.now() - new Date(data.retrieved_at).getTime();
  if (age > TTL_MS) return null;
  const payload = data.payload as PlaceDetails;
  memPlace.set(placeId, { at: Date.now(), data: payload });
  return payload;
}

export async function setCachedPlaceDetails(
  placeId: string,
  details: PlaceDetails,
) {
  memPlace.set(placeId, { at: Date.now(), data: details });
  const supabase = createServiceClient();
  if (!supabase) return;
  await supabase.from("place_cache").upsert({
    place_id: placeId,
    payload: details,
    retrieved_at: new Date().toISOString(),
  });
}

export async function getCachedRoute(key: string): Promise<unknown | null> {
  const mem = memRoute.get(key);
  if (mem && Date.now() - mem.at < TTL_MS) return mem.data;
  const supabase = createServiceClient();
  if (!supabase) return mem?.data ?? null;
  const { data } = await supabase
    .from("route_cache")
    .select("payload, retrieved_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.retrieved_at).getTime() > TTL_MS) return null;
  return data.payload;
}

export async function setCachedRoute(key: string, payload: unknown) {
  memRoute.set(key, { at: Date.now(), data: payload });
  const supabase = createServiceClient();
  if (!supabase) return;
  await supabase.from("route_cache").upsert({
    cache_key: key,
    payload,
    retrieved_at: new Date().toISOString(),
  });
}
