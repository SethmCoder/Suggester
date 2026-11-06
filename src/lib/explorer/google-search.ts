import { canUseSku, incrementSku } from "@/lib/google/api-usage";
import { cacheGet, cacheSet } from "@/lib/http/accountless-fetch";
import type { ExplorerPlace } from "./types";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  googleMapsUri?: string;
  photos?: { name?: string }[];
};

function categoryFromTypes(types: string[]): string {
  const list = types.map((type) => type.toLowerCase());
  if (list.some((type) => type.includes("restaurant") || type.includes("food") || type === "cafe")) {
    return "restaurants";
  }
  if (list.some((type) => type.includes("museum") || type.includes("art_gallery"))) return "museums";
  if (list.some((type) => type.includes("park") || type.includes("natural"))) return "nature";
  if (list.some((type) => type.includes("shopping") || type.includes("store") || type.includes("market"))) {
    return "shopping";
  }
  if (list.some((type) => type.includes("night") || type.includes("bar") || type.includes("movie") || type.includes("stadium"))) {
    return "entertainment";
  }
  if (list.some((type) => type.includes("church") || type.includes("mosque") || type.includes("hindu") || type.includes("landmark"))) {
    return "architecture";
  }
  return "attractions";
}

function normalize(raw: RawPlace): ExplorerPlace | null {
  if (!raw.id || !raw.displayName?.text || raw.location?.latitude == null || raw.location.longitude == null) {
    return null;
  }
  const hours = raw.regularOpeningHours?.weekdayDescriptions?.filter(Boolean).slice(0, 2).join(" · ") || null;
  return {
    id: raw.id,
    name: raw.displayName.text,
    category: categoryFromTypes(raw.types ?? []),
    address: raw.formattedAddress ?? null,
    lat: raw.location.latitude,
    lng: raw.location.longitude,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviewCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    priceLevel: raw.priceLevel ? PRICE[raw.priceLevel] ?? null : null,
    hours,
    mapsUrl: raw.googleMapsUri ?? null,
    photoName: raw.photos?.[0]?.name ?? null,
    source: "google",
    why: "",
  };
}

export function googlePlacesConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

export async function searchGooglePlaces(input: {
  query: string;
  lat: number;
  lng: number;
}): Promise<ExplorerPlace[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return [];
  const cacheKey = `explorer-google:${input.query.toLowerCase()}:${input.lat.toFixed(2)}:${input.lng.toFixed(2)}`;
  const cached = cacheGet<ExplorerPlace[]>(cacheKey);
  if (cached) return cached;
  if (!(await canUseSku("places.searchText"))) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours.weekdayDescriptions,places.googleMapsUri,places.photos.name",
    },
    body: JSON.stringify({
      textQuery: input.query,
      pageSize: 8,
      locationBias: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: 20000,
        },
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  await incrementSku("places.searchText");
  const data = (await res.json()) as { places?: RawPlace[] };
  const places = (data.places ?? []).map(normalize).filter((place): place is ExplorerPlace => Boolean(place));
  cacheSet(cacheKey, places, CACHE_TTL_MS);
  return places;
}
