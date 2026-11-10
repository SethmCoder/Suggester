import { NextResponse } from "next/server";
import { lookupFlightByNumber } from "@/lib/flights/aviationstack";

/**
 * Live flight status via AviationStack.
 * GET ?flight=NH118&date=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const flight = searchParams.get("flight")?.trim() ?? "";
  const date = searchParams.get("date");
  if (!flight) {
    return NextResponse.json({ error: "flight required" }, { status: 400 });
  }
  const result = await lookupFlightByNumber({
    flightNumber: flight,
    date,
  });
  return NextResponse.json(result);
}
