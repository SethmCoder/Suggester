import { NextResponse } from "next/server";
import { searchHotels } from "@/lib/hotels/catalog";

/**
 * Hotel search. OpenStreetMap catalog, with Google left to the places routes
 * when a Google key is configured.
 * GET ?lat=&lng=&q=westin&limit=8
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(12, Math.max(1, Number(searchParams.get("limit") ?? 8)));
  const city = searchParams.get("city") ?? "";

  if (!q && (!Number.isFinite(lat) || !Number.isFinite(lng)) && city.length < 2) {
    return NextResponse.json(
      { error: "Provide a hotel name, a city, or a location.", hotels: [] },
      { status: 400 },
    );
  }

  try {
    const result = await searchHotels({
      q: q || undefined,
      city: city || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      limit,
    });
    return NextResponse.json({
      hotels: result.hotels.map((hotel) => ({
        placeId: hotel.id,
        name: hotel.name,
        address: hotel.address,
        lat: hotel.latitude,
        lng: hotel.longitude,
        propertyType: hotel.propertyType,
        website: hotel.website,
        phone: hotel.phone,
        starRating: hotel.starRating,
        label: hotel.address ? `${hotel.name} · ${hotel.address}` : hotel.name,
      })),
      attribution: "© OpenStreetMap contributors",
    });
  } catch {
    return NextResponse.json({ hotels: [] });
  }
}
