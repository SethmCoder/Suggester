import { resolveGeonameCity } from "@/lib/geonames/cities";
import { accountlessFetch, cacheGet, cacheSet, waypointUserAgent } from "@/lib/http/accountless-fetch";
import type { PlaceCategory } from "@/lib/places/types";
import type { ExplorerCategory, ExplorerPlace } from "./types";

const OSM_CATEGORIES: Record<ExplorerCategory, PlaceCategory[]> = {
  restaurants: ["restaurant", "cafe"],
  attractions: ["attraction", "viewpoint"],
  architecture: ["historic", "attraction"],
  museums: ["museum"],
  nature: ["park", "beach"],
  shopping: ["shopping"],
  entertainment: ["entertainment"],
  hidden: ["historic", "viewpoint", "park"],
};

const FILTERS: Record<PlaceCategory, { key: string; value: string }> = {
  restaurant: { key: "amenity", value: "restaurant" },
  cafe: { key: "amenity", value: "cafe" },
  hotel: { key: "tourism", value: "hotel" },
  museum: { key: "tourism", value: "museum" },
  attraction: { key: "tourism", value: "attraction" },
  historic: { key: "historic", value: "monument" },
  park: { key: "leisure", value: "park" },
  beach: { key: "natural", value: "beach" },
  viewpoint: { key: "tourism", value: "viewpoint" },
  shopping: { key: "shop", value: "mall" },
  entertainment: { key: "amenity", value: "theatre" },
  other: { key: "tourism", value: "attraction" },
};

export async function searchOsmPlaces(input: {
  city: string;
  lat: number;
  lng: number;
  categories: ExplorerCategory[];
}): Promise<ExplorerPlace[]> {
  const cacheKey = `explorer-osm:${input.city.toLowerCase()}:${input.categories.join(",")}`;
  const cached = cacheGet<ExplorerPlace[]>(cacheKey);
  if (cached) return cached;
  const categories = input.categories.length ? input.categories : (["attractions", "restaurants"] as ExplorerCategory[]);
  const named = await nominatimPlaces(input.city, categories, { lat: input.lat, lng: input.lng });
  if (named.length) {
    cacheSet(cacheKey, named, 6 * 60 * 60 * 1000);
    return named;
  }
  const filters = [...new Set(categories.flatMap((category) => OSM_CATEGORIES[category]))]
    .map((category) => FILTERS[category])
    .filter(Boolean)
    .slice(0, 3);
  const selectors = filters
    .map((filter) => `node["name"]["${filter.key}"="${filter.value}"](around:2500,${input.lat},${input.lng});`)
    .join("\n");
  const query = `[out:json][timeout:20];(${selectors});out center 12;`;
  try {
    const res = await accountlessFetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": waypointUserAgent(),
      },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs: 12000,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      elements?: { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string> }[];
    };
    const places: ExplorerPlace[] = [];
    for (const element of data.elements ?? []) {
      const name = element.tags?.name?.trim();
      if (!name || element.lat == null || element.lon == null) continue;
      const tags = element.tags ?? {};
      places.push({
        id: `osm:${element.type}:${element.id}`,
        name,
        category: tags.amenity || tags.tourism || tags.leisure || "place",
        address: [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || null,
        lat: element.lat,
        lng: element.lon,
        rating: null,
        reviewCount: null,
        priceLevel: null,
        hours: tags.opening_hours ?? null,
        mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        photoName: null,
        source: "openstreetmap",
        why: "",
      });
    }
    if (places.length) {
      cacheSet(cacheKey, places, 6 * 60 * 60 * 1000);
      return places;
    }
  } catch {
    // Overpass can time out. Nominatim is the second OpenStreetMap lookup.
  }
  return [];
}

async function nominatimPlaces(
  city: string,
  categories: ExplorerCategory[],
  center: { lat: number; lng: number },
): Promise<ExplorerPlace[]> {
  const cacheKey = `explorer-nominatim:${city.toLowerCase()}:${categories.join(",")}`;
  const cached = cacheGet<ExplorerPlace[]>(cacheKey);
  if (cached) return cached;
  const kind = categories.includes("restaurants")
    ? "restaurant"
    : categories.includes("museums")
      ? "museum"
      : categories.includes("nature")
        ? "park"
        : categories.includes("shopping")
          ? "market"
          : "attraction";
  const viewbox = `${center.lng - 0.08},${center.lat + 0.06},${center.lng + 0.08},${center.lat - 0.06}`;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(kind)}`;
    const res = await accountlessFetch(url, {
      headers: { "User-Agent": waypointUserAgent(), Accept: "application/json" },
      timeoutMs: 12000,
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as {
      osm_type?: string;
      osm_id?: number;
      lat?: string;
      lon?: string;
      name?: string;
      display_name?: string;
      type?: string;
    }[];
    const places = rows
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        const name = row.name?.trim();
        if (!name || !row.osm_id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const place: ExplorerPlace = {
          id: `osm:${row.osm_type}:${row.osm_id}`,
          name,
          category: row.type || kind,
          address: row.display_name ?? null,
          lat,
          lng,
          rating: null,
          reviewCount: null,
          priceLevel: null,
          hours: null,
          mapsUrl: `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`,
          photoName: null,
          source: "openstreetmap",
          why: "",
        };
        return place;
      })
      .filter((place): place is ExplorerPlace => Boolean(place));
    if (places.length) cacheSet(cacheKey, places, 6 * 60 * 60 * 1000);
    return places;
  } catch {
    return [];
  }
}

export function cityCenter(city: string): { lat: number; lng: number; name: string } | null {
  const found = resolveGeonameCity(city);
  if (!found) return null;
  return { lat: found.lat, lng: found.lng, name: found.name };
}
