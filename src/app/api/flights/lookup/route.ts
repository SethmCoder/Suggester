import { NextResponse } from "next/server";
import {
  estimateFlight,
  listRoutesFrom,
  nearbyAirports,
  searchAirports,
} from "@/lib/flights/openflights";
/**
 * OpenFlights airport / route lookup (no live flight-number API).
 * GET ?q=SEA — airport search
 * GET ?from=SEA&to=HND — estimate block time + arrival
 * GET ?from=SEA&routes=1 — sample destinations from origin
 * Flight times: paste a confirmation email — do not look up by flight number.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const routes = searchParams.get("routes");
    const flight = searchParams.get("flight");
    const dep = searchParams.get("dep") ?? undefined;

    if (flight) {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const { findUserFlight } = await import("@/lib/flights/user-flights");
      const svc = createServiceClient();
      const flightDate = searchParams.get("date");
      if (!svc) {
        return NextResponse.json({
          flight: {
            found: false,
            source: "none",
            flightNumber: flight.replace(/\s+/g, "").toUpperCase(),
            rawNote: "Flight database offline — paste a confirmation instead.",
          },
        });
      }
      const row = await findUserFlight(svc, {
        flightNumber: flight,
        date: flightDate,
      });
      if (!row) {
        return NextResponse.json({
          flight: {
            found: false,
            source: "user_flights",
            flightNumber: flight.replace(/\s+/g, "").toUpperCase(),
            rawNote:
              "Not in the traveler flight DB yet — paste a confirmation to add it.",
          },
        });
      }
      return NextResponse.json({
        flight: {
          found: true,
          source: "user_flights",
          flightNumber: row.flight_number,
          airline: row.airline,
          fromIata: row.from_iata,
          toIata: row.to_iata,
          arrivalTime: row.arrival_local,
          departureTime: row.departure_local,
          date: row.travel_date,
          reportCount: row.report_count,
          rawNote: `From traveler confirmations (${row.report_count}).`,
        },
      });
    }
    // Important: Number(null) === 0, so only parse when params are present
    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
    const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
    const near =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

    // Route / flight estimate takes priority over airport autocomplete
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
          { error: "Couldn’t find one of those airports. Try another code or city." },
          { status: 404 },
        );
      }
      return NextResponse.json({ estimate });
    }

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
