import { NextResponse } from "next/server";
import { getPlaceBrief } from "@/lib/places/place-brief";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "name, lat, and lng are required" },
      { status: 400 },
    );
  }
  try {
    const brief = await getPlaceBrief({
      name,
      lat,
      lng,
      address: searchParams.get("address"),
    });
    return NextResponse.json(brief);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load place" },
      { status: 502 },
    );
  }
}
