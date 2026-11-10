import { NextResponse } from "next/server";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { parseBookingFromEmailText } from "@/lib/dreamer/parse-email";
import { summarizeParsedBooking } from "@/lib/dreamer/summary";
import {
  findUserFlight,
  flightContributionFromParsed,
  upsertUserFlightFromParsed,
} from "@/lib/flights/user-flights";

/**
 * Community flight DB built from confirmation pastes.
 * GET  ?flight=NH118&date=YYYY-MM-DD — read saved schedule facts
 * POST { text } or { parsed fields } — contribute from a confirmation (signed-in)
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
    return NextResponse.json({ found: false, offline: true });
  }

  const row = await findUserFlight(svc, {
    flightNumber: flight,
    date,
    fromIata: searchParams.get("from"),
    toIata: searchParams.get("to"),
  });

  if (!row) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    source: "user_flights",
    flight: {
      flightNumber: row.flight_number,
      fromIata: row.from_iata,
      toIata: row.to_iata,
      travelDate: row.travel_date,
      departureLocal: row.departure_local,
      arrivalLocal: row.arrival_local,
      cabin: row.cabin,
      airline: row.airline,
      reportCount: row.report_count,
    },
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: {
    text?: string;
    subject?: string;
    flightNumber?: string;
    fromIata?: string;
    toIata?: string;
    travelDate?: string;
    departureLocal?: string;
    arrivalLocal?: string;
    cabin?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = body.text
    ? parseBookingFromEmailText({
        subject: body.subject ?? "Pasted booking",
        text: body.text,
      })
    : {
        kind: "flight" as const,
        flightNumber: body.flightNumber ?? null,
        fromIata: body.fromIata ?? null,
        toIata: body.toIata ?? null,
        startDate: body.travelDate ?? null,
        departureLocal: body.departureLocal ?? null,
        arrivalLocal: body.arrivalLocal ?? null,
        cabin: body.cabin ?? null,
        cities: [],
        confirmation: null,
        endDate: null,
        hotelName: null,
        vendor: null,
        nights: null,
      };

  if (!flightContributionFromParsed(parsed)) {
    return NextResponse.json(
      {
        error:
          "Need flight number, route (from/to), and travel date from the confirmation.",
        parsed,
        summary: summarizeParsedBooking(parsed),
      },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({
      offline: true,
      parsed,
      summary: summarizeParsedBooking(parsed),
    });
  }

  try {
    const row = await upsertUserFlightFromParsed(svc, parsed, user.id);
    return NextResponse.json({
      ok: Boolean(row),
      stored: row,
      parsed,
      summary: summarizeParsedBooking(parsed),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Store failed";
    // Never surface raw Supabase key errors to the confirmation UI.
    return NextResponse.json({
      ok: false,
      offline: true,
      parsed,
      summary: summarizeParsedBooking(parsed),
      warning: /invalid api key|jwt|unauthorized/i.test(message)
        ? undefined
        : message,
    });
  }
}
