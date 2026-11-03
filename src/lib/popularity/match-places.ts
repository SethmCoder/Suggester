import { textSearchPlace } from "../google/places";

const memoryResolved = new Map<string, { placeId: string; displayName: string }>();

export async function resolvePlaceForMention(input: {
  name: string;
  destination: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}): Promise<{ placeId: string; displayName: string } | null> {
  const key = `${input.destination}|${input.name}`.toLowerCase();
  if (memoryResolved.has(key)) return memoryResolved.get(key)!;

  const query = `${input.name} ${input.destination}`;
  const hit = await textSearchPlace({
    query,
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    radiusMeters: input.radiusKm * 1000,
  });
  if (!hit) return null;

  const value = { placeId: hit.placeId, displayName: hit.displayName };
  memoryResolved.set(key, value);
  return value;
}
