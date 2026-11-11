import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discoverPlacesFromOsm } from "@/lib/places/osm-discover";
import type { PlaceCategory } from "@/lib/places/types";
import { geocodeDestination } from "@/lib/maps";
import {
  LANGUAGE_COOKIE,
  normalizeLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/preference";

function categoriesForMinutes(startMinutes: number): PlaceCategory[] {
  if (startMinutes < 11 * 60) return ["cafe", "park", "attraction"];
  if (startMinutes < 14 * 60) return ["restaurant", "museum", "attraction"];
  if (startMinutes < 17 * 60) return ["museum", "attraction", "historic", "park"];
  if (startMinutes < 20 * 60) return ["restaurant", "shopping", "viewpoint"];
  return ["restaurant", "entertainment", "cafe"];
}

function localizedName(
  tags: Record<string, string> | undefined,
  lang: AppLanguageCode,
  fallback: string,
): string {
  if (!tags) return fallback;
  return (
    tags[`name:${lang}`] ||
    tags[`name:${lang.split("-")[0]}`] ||
    (lang === "zh" ? tags["name:zh-Hans"] || tags["name:zh-Hant"] : "") ||
    tags.name ||
    fallback
  );
}

/** Nearby OSM places for a dragged calendar slot — not Nominatim text search. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city")?.trim() || "";
  const startMinutes = Number(url.searchParams.get("startMinutes") ?? "720");
  let lat = Number(url.searchParams.get("lat"));
  let lng = Number(url.searchParams.get("lng"));
  const limit = Math.min(8, Math.max(3, Number(url.searchParams.get("limit") ?? "6")));

  const jar = await cookies();
  const lang = normalizeLanguage(
    url.searchParams.get("lang") || jar.get(LANGUAGE_COOKIE)?.value,
  );

  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && city) {
    const geo = await geocodeDestination(city);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      {
        results: [],
        error: city
          ? `Could not place ${city} on the map yet.`
          : "Need a city or map coordinates for suggestions.",
      },
      { status: 200 },
    );
  }

  const categories = categoriesForMinutes(
    Number.isFinite(startMinutes) ? startMinutes : 12 * 60,
  );

  let places = await discoverPlacesFromOsm({
    destination: city || "nearby",
    lat,
    lng,
    radiusMeters: 2500,
    categories,
    limit: 24,
  });

  // Broaden if the time-of-day filter was too narrow.
  if (places.length < 3) {
    const broader = await discoverPlacesFromOsm({
      destination: city || "nearby",
      lat,
      lng,
      radiusMeters: 4500,
      categories: [
        "attraction",
        "museum",
        "cafe",
        "restaurant",
        "park",
        "historic",
        "shopping",
      ],
      limit: 24,
    });
    const seen = new Set(places.map((p) => p.placeId));
    for (const place of broader) {
      if (seen.has(place.placeId)) continue;
      places.push(place);
      seen.add(place.placeId);
    }
  }

  const results = places.slice(0, limit).map((place) => ({
    id: place.placeId,
    name: localizedName(place.tags, lang, place.name),
    address: place.address || city || "",
    lat: place.lat,
    lng: place.lng,
    category: place.category,
  }));

  return NextResponse.json({
    results,
    notice: results.length
      ? "Suggestions from OpenStreetMap near this slot."
      : "No nearby places matched this slot yet — try Manual input.",
  });
}
