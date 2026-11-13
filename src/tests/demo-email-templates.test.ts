import { describe, expect, it } from "vitest";
import { parseBookingFromEmailText } from "@/lib/dreamer/parse-email";
import {
  DEFAULT_DEMO_FLIGHT_FIELDS,
  DEFAULT_DEMO_HOTEL_FIELDS,
  buildDemoFlightEmail,
  buildDemoHotelEmail,
} from "@/lib/demo/email-templates";
import { getDemoTripPayload, listDemoTrips } from "@/lib/demo/data";

describe("demo email templates", () => {
  it("flight template parses to SEA→CDG with times", () => {
    const text = buildDemoFlightEmail(DEFAULT_DEMO_FLIGHT_FIELDS);
    const parsed = parseBookingFromEmailText({ text });
    expect(parsed.kind).toBe("flight");
    expect(parsed.fromIata).toBe("SEA");
    expect(parsed.toIata).toBe("CDG");
    expect(parsed.flightNumber).toBe("AF039");
    expect(parsed.startDate).toBe("2026-06-01");
    expect(parsed.departureLocal).toBe("15:40");
    expect(parsed.arrivalLocal).toBe("11:10");
    expect(parsed.confirmation).toBe("P4R1S7");
    expect(parsed.cities).toContain("Paris");
  });

  it("hotel template parses property and stay dates", () => {
    const text = buildDemoHotelEmail(DEFAULT_DEMO_HOTEL_FIELDS);
    const parsed = parseBookingFromEmailText({ text });
    expect(parsed.kind).toBe("hotel");
    expect(parsed.hotelName).toMatch(/Grands Boulevards/i);
    expect(parsed.startDate).toBe("2026-06-01");
    expect(parsed.endDate).toBe("2026-06-04");
    expect(parsed.confirmation).toBe("HT88241");
  });

  it("editable flight fields change the parse", () => {
    const text = buildDemoFlightEmail({
      ...DEFAULT_DEMO_FLIGHT_FIELDS,
      fromIata: "JFK",
      toIata: "CDG",
      flightNumber: "AF007",
      date: "2026-06-02",
    });
    const parsed = parseBookingFromEmailText({ text });
    expect(parsed.fromIata).toBe("JFK");
    expect(parsed.toIata).toBe("CDG");
    expect(parsed.flightNumber).toBe("AF007");
    expect(parsed.startDate).toBe("2026-06-02");
  });
});

describe("paris demo itinerary structure", () => {
  it("is the only listed demo with four timed days", () => {
    expect(listDemoTrips()).toHaveLength(1);
    const payload = getDemoTripPayload();
    expect(payload.activities).toHaveLength(16);
    for (const a of payload.activities) {
      expect(a.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(a.end_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(a.lat).toBeTypeOf("number");
      expect(a.lng).toBeTypeOf("number");
    }
  });
});
