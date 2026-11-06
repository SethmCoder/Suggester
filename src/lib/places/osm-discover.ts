import {
  accountlessFetch,
  cacheGet,
  cacheSet,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";
import type { DiscoveredPlace, PlaceCategory } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 48;

const CATEGORY_FILTERS: Record<
  PlaceCategory,
  { key: string; values: string[] }
> = {
  restaurant: { key: "amenity", values: ["restaurant"] },
  cafe: { key: "amenity", values: ["cafe"] },
  hotel: { key: "tourism", values: ["hotel", "guest_house"] },
  museum: { key: "tourism", values: ["museum"] },
  attraction: { key: "tourism", values: ["attraction", "artwork", "zoo"] },
  historic: { key: "historic", values: ["monument", "castle", "memorial", "ruins", "yes"] },
  park: { key: "leisure", values: ["park", "garden"] },
  beach: { key: "natural", values: ["beach"] },
  viewpoint: { key: "tourism", values: ["viewpoint"] },
  shopping: { key: "shop", values: ["mall", "department_store", "clothes", "gift"] },
  entertainment: {
    key: "amenity",
    values: ["theatre", "cinema", "nightclub", "arts_centre"],
  },
  other: { key: "tourism", values: ["yes"] },
};

function metersToDeg(lat: number, meters: number) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng: Math.abs(dLng) };
}

function parseWikipediaTag(raw?: string): string | null {
  if (!raw) return null;
  // Formats: "en:Eiffel Tower" or "Eiffel Tower"
  const parts = raw.split(":");
  const title = parts.length > 1 ? parts.slice(1).join(":") : parts[0];
  return title.trim().replace(/ /g, "_") || null;
}

function categorize(tags: Record<string, string>): PlaceCategory {
  for (const [cat, spec] of Object.entries(CATEGORY_FILTERS) as [
    PlaceCategory,
    { key: string; values: string[] },
  ][]) {
    if (cat === "other") continue;
    const v = tags[spec.key];
    if (v && spec.values.includes(v)) return cat;
  }
  if (tags.tourism) return "attraction";
  return "other";
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || tags["addr:place"],
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function buildQuery(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  categories: PlaceCategory[];
  limit: number;
}): string {
  const { dLat, dLng } = metersToDeg(input.lat, input.radiusMeters);
  const south = input.lat - dLat;
  const north = input.lat + dLat;
  const west = input.lng - dLng;
  const east = input.lng + dLng;
  const bbox = `${south},${west},${north},${east}`;

  const cats =
    input.categories.length > 0
      ? input.categories
      : ([
          "museum",
          "attraction",
          "historic",
          "park",
          "viewpoint",
          "restaurant",
          "cafe",
        ] as PlaceCategory[]);

  const selectors: string[] = [];
  for (const cat of cats) {
    const spec = CATEGORY_FILTERS[cat];
    if (!spec) continue;
    for (const val of spec.values) {
      selectors.push(`node["${spec.key}"="${val}"](${bbox});`);
      selectors.push(`way["${spec.key}"="${val}"](${bbox});`);
    }
  }

  // Cap Overpass work — prototype-scale only
  const body = `
[out:json][timeout:25];
(
  ${selectors.slice(0, 40).join("\n  ")}
);
out center ${input.limit};
`.trim();
  return body;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Discover POIs via public Overpass API (no account/key).
 * Cached 24h. Soft-fails to [] on errors.
 */
export async function discoverPlacesFromOsm(input: {
  destination: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  categories?: PlaceCategory[];
  limit?: number;
}): Promise<DiscoveredPlace[]> {
  const radius = input.radiusMeters ?? 6000;
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, 60);
  const categories = input.categories ?? [];
  const cacheKey = `osm-discover:${input.destination.toLowerCase()}|${input.lat.toFixed(3)}|${input.lng.toFixed(3)}|${radius}|${categories.join(",")}|${limit}`;

  const cached = cacheGet<DiscoveredPlace[]>(cacheKey);
  if (cached) return cached;

  const query = buildQuery({
    lat: input.lat,
    lng: input.lng,
    radiusMeters: radius,
    categories,
    limit,
  });

  try {
    const res = await accountlessFetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": waypointUserAgent(),
      },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs: 28000,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const places: DiscoveredPlace[] = [];
    const now = new Date().toISOString();

    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      const osmId = `${el.type}/${el.id}`;
      if (seen.has(osmId)) continue;
      seen.add(osmId);
      const placeId = `osm:${el.type}:${el.id}`;
      places.push({
        placeId,
        name,
        category: categorize(tags),
        address: buildAddress(tags),
        lat,
        lng,
        osmId,
        tags,
        wikipediaTitle: parseWikipediaTag(tags.wikipedia),
        wikidataId: tags.wikidata ?? null,
        source: "openstreetmap",
        retrievedAt: now,
      });
      if (places.length >= limit) break;
    }

    cacheSet(cacheKey, places, CACHE_TTL_MS);
    return places;
  } catch {
    return [];
  }
}

/** Map discovered OSM places into PlaceHit-compatible shapes for generation. */
export function discoveredToPlaceHits(places: DiscoveredPlace[]) {
  return places.map((p) => ({
    placeId: p.placeId,
    displayName: p.name,
    lat: p.lat,
    lng: p.lng,
    types: [p.category, p.tags.tourism, p.tags.amenity, p.tags.historic]
      .filter(Boolean) as string[],
    formattedAddress: p.address ?? undefined,
    openingHours: p.tags.opening_hours,
    wheelchair: p.tags.wheelchair ?? null,
    fee: p.tags.fee ?? null,
    cuisine: p.tags.cuisine ?? null,
    wikipediaTitle: p.wikipediaTitle,
    wikidataId: p.wikidataId,
  }));
}

/** Pure helper for tests — dedupe by osmId. */
export function dedupeDiscoveredPlaces(
  places: DiscoveredPlace[],
): DiscoveredPlace[] {
  const seen = new Set<string>();
  const out: DiscoveredPlace[] = [];
  for (const p of places) {
    if (seen.has(p.osmId)) continue;
    seen.add(p.osmId);
    out.push(p);
  }
  return out;
}
