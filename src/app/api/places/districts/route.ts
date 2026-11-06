import { NextResponse } from "next/server";
import { cityAreaPins } from "@/lib/places/city-pins";

export async function GET(req: Request) {
  const city = new URL(req.url).searchParams.get("city")?.trim();
  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }
  const cities = cityAreaPins(city);
  if (!cities.length) {
    return NextResponse.json({
      cities: [],
      notice: "That city is not in the city data, so there is no population center to pin.",
    });
  }
  return NextResponse.json({ cities });
}
