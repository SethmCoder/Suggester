import { NextResponse } from "next/server";
import { getPlaceCard } from "@/lib/places/place-card";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "name, lat, and lng are required" }, { status: 400 });
  }
  try {
    const card = await getPlaceCard({
      name,
      lat,
      lng,
      address: url.searchParams.get("address"),
    });
    return NextResponse.json(card);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load place" },
      { status: 502 },
    );
  }
}
