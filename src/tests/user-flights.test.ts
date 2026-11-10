import { describe, expect, it } from "vitest";
import { parseBookingFromEmailText } from "@/lib/dreamer/parse-email";
import { flightContributionFromParsed } from "@/lib/flights/user-flights";

describe("user_flights contributions", () => {
  it("builds a storeable row from a confirmation without PNR", () => {
    const parsed = parseBookingFromEmailText({
      subject: "Your ANA e-ticket — NH118 Tokyo to Seattle",
      text: `
Flight number: NH118
Route: HND → SEA
Travel date: 2026-11-10
Confirmation code: K2P8NH
Cabin: Economy
Scheduled departure: 9:15 PM
Scheduled arrival: 1:20 PM
`,
    });
    const row = flightContributionFromParsed(parsed);
    expect(row).toEqual({
      flight_number: "NH118",
      from_iata: "HND",
      to_iata: "SEA",
      travel_date: "2026-11-10",
      departure_local: "21:15",
      arrival_local: "13:20",
      cabin: "economy",
    });
    expect(JSON.stringify(row)).not.toMatch(/K2P8NH/);
  });

  it("rejects incomplete flights", () => {
    expect(
      flightContributionFromParsed({
        kind: "flight",
        flightNumber: "NH118",
        fromIata: "HND",
        toIata: null,
        startDate: "2026-11-10",
      }),
    ).toBeNull();
  });
});
