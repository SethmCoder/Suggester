import { NextResponse } from "next/server";
import { discoverPlacesFromOsm } from "@/lib/places/osm-discover";

/**
 * Nearby hotel suggestions via OpenStreetMap Overpass (no API key).
 * GET ?lat=&lng=&q=hilton&limit=8
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(12, Math.max(1, Number(searchParams.get("limit") ?? 8)));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required", hotels: [] },
      { status: 400 },
    );
  }

  try {
    const places = await discoverPlacesFromOsm({
      destination: `hotels@${lat.toFixed(3)},${lng.toFixed(3)}`,
      lat,
      lng,
      radiusMeters: q ? 12000 : 8000,
      categories: ["hotel"],
      limit: 48,
    });

    const filtered = (q
      ? places.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.address?.toLowerCase().includes(q) ?? false),
        )
      : places
    ).slice(0, limit);

    return NextResponse.json({
      hotels: filtered.map((p) => ({
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        label: p.address ? `${p.name} · ${p.address}` : p.name,
      })),
    });
  } catch {
    return NextResponse.json({ hotels: [] });
  }
}
