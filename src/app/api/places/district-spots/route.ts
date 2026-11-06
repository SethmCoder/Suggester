import { NextResponse } from "next/server";
import { districtSpots } from "@/lib/places/district-spots";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "name, lat, and lng are required" }, { status: 400 });
  }
  const interests = (url.searchParams.get("interests") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  try {
    const spots = await districtSpots({ name, lat, lng, interests });
    return NextResponse.json({
      spots,
      notice: spots.length
        ? "These places are from OpenStreetMap. Map data © OpenStreetMap contributors."
        : `No OpenStreetMap places were found near ${name} for this trip.`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load places" },
      { status: 502 },
    );
  }
}
