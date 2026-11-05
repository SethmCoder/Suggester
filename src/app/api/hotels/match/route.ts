import { NextResponse } from "next/server";
import { loadHotelRec } from "@/lib/hotels/hotelrec";
import {
  hotelNameMatchScore,
  searchHotelsByName,
} from "@/lib/hotels/name-match";
import { discoverPlacesFromOsm } from "@/lib/places/osm-discover";

export type HotelMatch = {
  id: string;
  name: string;
  label: string;
  rating: number | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Hotels in one city, best name match first.
 * HotelRec covers cities in the local subset; OpenStreetMap fills in
 * hotels near the city's coordinates when those are known.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim() ?? "";
  const q = searchParams.get("q")?.trim() ?? "";
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (city.length < 2 || q.length < 1) {
    return NextResponse.json({ hotels: [] as HotelMatch[] });
  }

  const ranked = new Map<string, HotelMatch & { score: number }>();

  function add(hit: HotelMatch & { score: number }) {
    const key = hit.name.trim().toLowerCase();
    const prev = ranked.get(key);
    if (!prev || hit.score > prev.score || (hit.score === prev.score && hit.lat != null && prev.lat == null)) {
      ranked.set(key, hit);
    }
  }

  const named = searchHotelsByName(loadHotelRec().hotels, {
    city,
    query: q,
    limit: 8,
  });
  for (const hotel of named ?? []) {
    add({
      id: hotel.id,
      name: hotel.name,
      label: `${hotel.name} · ${hotel.rating.toFixed(1)}/5 · ${hotel.location}`,
      rating: hotel.rating,
      lat: null,
      lng: null,
      score: hotelNameMatchScore(q, hotel.name) + hotel.rating,
    });
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const places = await Promise.race([
        discoverPlacesFromOsm({
          destination: `${city} hotels`,
          lat,
          lng,
          radiusMeters: 14000,
          categories: ["hotel"],
          limit: 48,
        }),
        new Promise<never[]>((resolve) => {
          setTimeout(() => resolve([]), 2500);
        }),
      ]);
      for (const place of places) {
        const score = hotelNameMatchScore(q, place.name);
        if (score <= 0) continue;
        add({
          id: place.placeId,
          name: place.name,
          label: place.address ? `${place.name} · ${place.address}` : place.name,
          rating: null,
          lat: place.lat,
          lng: place.lng,
          score: score + 5,
        });
      }
    } catch {
      /* HotelRec matches still return */
    }
  }

  const hotels = [...ranked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...hotel }) => hotel);

  return NextResponse.json({ hotels });
}
