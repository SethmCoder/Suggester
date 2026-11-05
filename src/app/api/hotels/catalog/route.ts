import { NextResponse } from "next/server";
import { searchHotels } from "@/lib/hotels/catalog";
import { isHotelType, toPublicHotel, type HotelQuery } from "@/lib/hotels/record";

function num(value: string | null) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const propertyType = searchParams.get("type") ?? undefined;
  const south = num(searchParams.get("south"));
  const north = num(searchParams.get("north"));
  const west = num(searchParams.get("west"));
  const east = num(searchParams.get("east"));
  if (
    south != null &&
    north != null &&
    west != null &&
    east != null &&
    (Math.abs(north - south) > 0.6 || Math.abs(east - west) > 0.6)
  ) {
    return NextResponse.json(
      { error: "Search a smaller area.", hotels: [] },
      { status: 400 },
    );
  }

  const query: HotelQuery = {
    q: searchParams.get("q") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    lat: num(searchParams.get("lat")),
    lng: num(searchParams.get("lng")),
    radiusKm: num(searchParams.get("radiusKm")),
    south,
    west,
    north,
    east,
    propertyType: propertyType && isHotelType(propertyType) ? propertyType : undefined,
    minStars: num(searchParams.get("minStars")),
    amenity: searchParams.get("amenity") ?? undefined,
    limit: num(searchParams.get("limit")),
    offset: num(searchParams.get("offset")),
  };

  if (!query.q && !query.city && query.lat == null && south == null) {
    return NextResponse.json({ hotels: [], total: 0, attribution: null });
  }

  try {
    const result = await searchHotels(query);
    return NextResponse.json({
      hotels: result.hotels.map(toPublicHotel),
      total: result.total,
      offset: query.offset ?? 0,
      attribution: "© OpenStreetMap contributors",
      license: "Open Database License (ODbL)",
      wikidata: "Wikidata facts, when shown, are CC0 and only added from an OpenStreetMap Wikidata id.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Hotel search failed";
    return NextResponse.json({ error: message, hotels: [], total: 0 }, { status: 502 });
  }
}
