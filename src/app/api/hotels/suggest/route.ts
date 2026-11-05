import { NextResponse } from "next/server";
import { resolveGeonameCity } from "@/lib/geonames/cities";
import {
  suggestionNote,
  suggestHotels,
  type HotelPlacePreference,
} from "@/lib/hotels/hotelrec";
import { searchHotels } from "@/lib/hotels/catalog";

const PLACES = new Set(["any", "center", "beach", "sights", "transit"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim() ?? "";
  if (city.length < 2) {
    return NextResponse.json({ hotels: [], citation: null });
  }
  const minRating = Number(searchParams.get("minRating") ?? "0");
  const placeParam = searchParams.get("place") ?? "any";
  const place = (
    PLACES.has(placeParam) ? placeParam : "any"
  ) as HotelPlacePreference;
  const min = Number.isFinite(minRating) ? minRating : 0;
  const brand = searchParams.get("brand")?.trim() ?? "";
  const result = suggestHotels({
    city,
    minRating: min,
    place,
    brand,
    limit: brand ? 3 : 4,
  });
  if (result.hotels.length) {
    return NextResponse.json({
      ...result,
      note: suggestionNote({
        city,
        count: result.hotels.length,
        minRating: min,
        place,
        brand,
      }),
    });
  }

  const resolved = resolveGeonameCity(city);
  if (!resolved) {
    return NextResponse.json({
      hotels: [],
      citation: null,
      note: brand
        ? `No hotels in ${city} match “${brand}”. Waypoint does not invent hotel names.`
        : `No hotels matched ${city}. Waypoint does not invent hotel names.`,
    });
  }
  const found = await searchHotels({
    city,
    lat: resolved.lat,
    lng: resolved.lng,
    q: brand || undefined,
    minStars: brand ? undefined : min > 0 ? min : undefined,
    limit: brand ? 12 : 4,
  });
  const needle = brand.toLowerCase();
  const hotels = found.hotels
    .filter((hotel) => {
      if (!needle) return true;
      const blob = `${hotel.name} ${hotel.chain ?? ""}`.toLowerCase();
      return blob.includes(needle);
    })
    .slice(0, 3)
    .map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      location: hotel.address ?? hotel.city ?? city,
      rating: hotel.starRating ?? 0,
      reviewCount: 0,
      lat: hotel.latitude,
      lng: hotel.longitude,
      quotes: [],
    }));
  return NextResponse.json({
    hotels,
    citation: null,
    note: hotels.length
      ? brand
        ? `${hotels.length} ${brand} hotels in ${city}. Pick one and the days are built around it. © OpenStreetMap contributors.`
        : `Hotels in ${city}. Pick one and the days are built around it. © OpenStreetMap contributors.`
      : brand
        ? `No hotels in ${city} match “${brand}”. Try another brand, or enter one you already booked.`
        : `No hotels found in ${city}. Enter one you already booked, or try another city.`,
  });
}
