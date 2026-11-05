import { NextResponse } from "next/server";
import { resolveGeonameCity } from "@/lib/geonames/cities";
import {
  chooseOsmHotel,
  listOsmHotelsNear,
  rankOsmHotels,
} from "@/lib/hotels/osm-hotels";

export type HotelMatch = {
  id: string;
  name: string;
  label: string;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  suggested: boolean;
};

/**
 * OpenStreetMap hotels in one city.
 * One row is marked suggested: Groq chooses among these real hotels when a
 * key is set, otherwise the highest-ranked hotel (stars, then closeness).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim() ?? "";
  let lat = Number(searchParams.get("lat"));
  let lng = Number(searchParams.get("lng"));
  if (city.length < 2) {
    return NextResponse.json({ hotels: [] as HotelMatch[], source: "openstreetmap" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const resolved = resolveGeonameCity(city);
    if (!resolved) {
      return NextResponse.json({
        hotels: [] as HotelMatch[],
        source: "openstreetmap",
        reason: null,
      });
    }
    lat = resolved.lat;
    lng = resolved.lng;
  }

  const inputs = await listOsmHotelsNear({ lat, lng, limit: 20 });
  const ranked = rankOsmHotels(inputs, { lat, lng }).slice(0, 8);
  const suggestion = await chooseOsmHotel(city, ranked);
  const hotels: HotelMatch[] = ranked.map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    label: hotel.address
      ? `${hotel.name}${hotel.stars != null ? ` · ${hotel.stars}★` : ""} · ${hotel.address}`
      : hotel.name,
    rating: hotel.stars,
    lat: hotel.lat,
    lng: hotel.lng,
    suggested: hotel.id === suggestion.id,
  }));
  hotels.sort((a, b) => Number(b.suggested) - Number(a.suggested));

  return NextResponse.json({
    hotels,
    suggestedId: suggestion.id,
    suggestedBy: suggestion.by,
    source: "openstreetmap",
    reason:
      suggestion.id == null
        ? null
        : "A good fit for this city.",
  });
}
