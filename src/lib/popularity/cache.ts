import type { PopularitySignals } from "./types";
import { createServiceClient } from "../supabase/server";

const memory = new Map<
  string,
  { expires: number; rows: PopularitySignals[] }
>();

function memoryKey(destination: string) {
  return destination.trim().toLowerCase();
}

export async function getCachedPopularity(
  destination: string,
  ttlHours: number,
): Promise<PopularitySignals[] | null> {
  const key = memoryKey(destination);
  const mem = memory.get(key);
  if (mem && mem.expires > Date.now()) return mem.rows;

  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("place_popularity_cache")
    .select("*")
    .eq("destination_key", key)
    .maybeSingle();

  if (!data) return null;
  const retrieved = new Date(data.retrieved_at);
  const ageHours = (Date.now() - retrieved.getTime()) / 3_600_000;
  if (ageHours > ttlHours) return null;

  const rows = (data.payload as PopularitySignals[]).map((r) => ({
    ...r,
    retrievedAt: new Date(r.retrievedAt),
  }));
  memory.set(key, {
    expires: retrieved.getTime() + ttlHours * 3_600_000,
    rows,
  });
  return rows;
}

export async function upsertPopularityCache(
  destination: string,
  rows: PopularitySignals[],
): Promise<void> {
  const key = memoryKey(destination);
  memory.set(key, {
    expires: Date.now() + 7 * 24 * 3_600_000,
    rows,
  });

  const supabase = createServiceClient();
  if (!supabase) return;

  await supabase.from("place_popularity_cache").upsert({
    destination_key: key,
    payload: rows,
    retrieved_at: new Date().toISOString(),
  });
}
