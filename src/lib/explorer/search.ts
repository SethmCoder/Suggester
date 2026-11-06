import type { ExplorerCategory, ExplorerPlace, ExplorerSource } from "./types";
import { googlePlacesConfigured, searchGooglePlaces } from "./google-search";
import { cityCenter, searchOsmPlaces } from "./osm-search";

const PRICE_RANK: Record<string, number> = {
  Free: 0,
  $: 1,
  $$: 2,
  $$$: 3,
  $$$$: 4,
};

export function filterBudget(places: ExplorerPlace[], budget: string): ExplorerPlace[] {
  const cap = budget === "free" ? 0 : budget === "$" ? 1 : budget === "$$" ? 2 : budget === "$$$" ? 3 : null;
  if (cap == null) return places;
  return places.filter((place) => {
    if (!place.priceLevel) return true;
    return (PRICE_RANK[place.priceLevel] ?? 9) <= cap;
  });
}

export async function searchExplorerPlaces(input: {
  city: string;
  searches: { query: string; category?: string }[];
  categories: ExplorerCategory[];
  budget: string;
  excludeIds: string[];
}): Promise<{ places: ExplorerPlace[]; source: ExplorerSource | "none"; notice: string | null; center: { lat: number; lng: number } | null }> {
  const center = cityCenter(input.city);
  if (!center) {
    return {
      places: [],
      source: "none",
      notice: "That city is not in the city data, so there is no center to search around.",
      center: null,
    };
  }
  const exclude = new Set(input.excludeIds);
  const queries = input.searches.slice(0, 3);
  let source: ExplorerSource | "none" = "none";
  let notice: string | null = null;
  const found: ExplorerPlace[] = [];

  if (googlePlacesConfigured() && queries.length) {
    source = "google";
    const batches = await Promise.all(
      queries.map((search) =>
        searchGooglePlaces({ query: search.query, lat: center.lat, lng: center.lng }).catch(() => []),
      ),
    );
    for (const batch of batches) {
      for (const place of batch) {
        if (exclude.has(place.id) || found.some((item) => item.id === place.id)) continue;
        found.push(place);
      }
    }
    if (!found.length) notice = "Google Places returned no matches for that search.";
  }

  if (!found.length) {
    const osm = await searchOsmPlaces({
      city: center.name,
      lat: center.lat,
      lng: center.lng,
      categories: input.categories,
    });
    for (const place of osm) {
      if (exclude.has(place.id) || found.some((item) => item.id === place.id)) continue;
      found.push(place);
    }
    if (found.length) {
      source = "openstreetmap";
      notice = googlePlacesConfigured()
        ? "Google Places returned nothing, so these are OpenStreetMap places. Map data © OpenStreetMap contributors."
        : "Google Places is not configured. These are OpenStreetMap places. Map data © OpenStreetMap contributors.";
    }
  }

  return {
    places: filterBudget(found, input.budget).slice(0, 18),
    source,
    notice,
    center,
  };
}
