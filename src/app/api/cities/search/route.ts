import { NextResponse } from "next/server";
import { searchGeonameCities } from "@/lib/geonames/cities";

/** GeoNames-backed city autocomplete (local dump, no API key). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ cities: [] });
  }
  const cities = searchGeonameCities(q, 10).map((c) => ({
    id: c.id,
    name: c.name,
    countryCode: c.countryCode,
    lat: c.lat,
    lng: c.lng,
    population: c.population,
    label: `${c.name}, ${c.countryCode}`,
  }));
  return NextResponse.json({ cities });
}
