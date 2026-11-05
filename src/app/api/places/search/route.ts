import { NextResponse } from "next/server";
import {
  accountlessFetch,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";

/** Nominatim place search for adding a stop. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
  });
  const nearLat = Number(searchParams.get("lat"));
  const nearLng = Number(searchParams.get("lng"));
  if (Number.isFinite(nearLat) && Number.isFinite(nearLng)) {
    params.set("lat", String(nearLat));
    params.set("lon", String(nearLng));
  }
  const res = await accountlessFetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        "User-Agent": waypointUserAgent(),
        Accept: "application/json",
      },
      timeoutMs: 10000,
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Place search failed" }, { status: 502 });
  }
  const rows = (await res.json()) as {
    place_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    name?: string;
  }[];
  return NextResponse.json({
    results: rows
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const display = row.display_name ?? row.name ?? q;
        const name = row.name?.trim() || display.split(",")[0]?.trim() || q;
        return {
          id: String(row.place_id ?? `${lat},${lng}`),
          name,
          address: display,
          lat,
          lng,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row)),
  });
}
