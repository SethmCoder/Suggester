import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { findUserFlight } from "@/lib/flights/user-flights";

/**
 * Flight facts from the user-built Supabase database (confirmation pastes).
 * GET ?flight=NH118&date=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const flight = searchParams.get("flight")?.trim() ?? "";
  const date = searchParams.get("date");
  if (!flight) {
    return NextResponse.json({ error: "flight required" }, { status: 400 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({
      found: false,
      source: "none",
      flightNumber: flight.replace(/\s+/g, "").toUpperCase(),
      rawNote: "Flight database offline.",
    });
  }

  const row = await findUserFlight(svc, { flightNumber: flight, date });
  if (!row) {
    return NextResponse.json({
      found: false,
      source: "user_flights",
      flightNumber: flight.replace(/\s+/g, "").toUpperCase(),
      rawNote:
        "No one has saved this flight yet — paste a confirmation to add it.",
    });
  }

  return NextResponse.json({
    found: true,
    source: "user_flights",
    flightNumber: row.flight_number,
    airline: row.airline,
    fromIata: row.from_iata,
    toIata: row.to_iata,
    arrivalTime: row.arrival_local,
    departureTime: row.departure_local,
    status: null,
    delayMinutes: null,
    delayed: false,
    date: row.travel_date,
    reportCount: row.report_count,
    rawNote: `Saved by travelers (${row.report_count} report${row.report_count === 1 ? "" : "s"}).`,
  });
}
