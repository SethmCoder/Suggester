import { NextResponse } from "next/server";
import {
  estimateFlight,
  listRoutesFrom,
  nearbyAirports,
  searchAirports,
} from "@/lib/flights/openflights";

/**
 * OpenFlights-backed airport / route lookup (no commercial flight API).
 * GET ?q=SEA — airport search
 * GET ?q=sea&lat=&lng= — search biased to area
 * GET ?lat=&lng= — nearest airports (empty q)
 * GET ?from=SEA&to=HND — estimate block time + arrival
 * GET ?from=SEA&routes=1 — sample destinations from origin
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const routes = searchParams.get("routes");
    const dep = searchParams.get("dep") ?? undefined;
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const near =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

    if (q != null || near) {
      const airports =
        q && q.trim()
          ? await searchAirports(q, 10, near)
          : near
            ? await nearbyAirports(near.lat, near.lng, 10)
            : [];
      return NextResponse.json({
        airports: airports.map((a) => ({
          ...a,
          label: `${a.iata} · ${a.name} (${a.city})`,
        })),
      });
    }

    if (from && routes === "1") {
      const list = await listRoutesFrom(from, 50);
      return NextResponse.json({ from: from.toUpperCase(), routes: list });
    }

    if (from && to) {
      const estimate = await estimateFlight({
        from,
        to,
        departureLocal: dep,
      });
      if (!estimate) {
        return NextResponse.json(
          { error: "Could not resolve one or both airports in OpenFlights data" },
          { status: 404 },
        );
      }
      return NextResponse.json({ estimate });
    }

    return NextResponse.json(
      {
        error: "Provide q=, or from=&to=, or from=&routes=1",
        sources: [
          "airports-extended.dat",
          "routes.dat",
          "airlines.dat",
        ],
      },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
