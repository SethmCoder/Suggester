import { NextResponse } from "next/server";
import {
  suggestionNote,
  suggestHotels,
  type HotelPlacePreference,
} from "@/lib/hotels/hotelrec";

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
  const result = suggestHotels({
    city,
    minRating: min,
    place,
    limit: 4,
  });
  return NextResponse.json({
    ...result,
    note: suggestionNote({
      city,
      count: result.hotels.length,
      minRating: min,
      place,
    }),
  });
}
