import { describe, expect, it } from "vitest";
import { filterAirlines, flightRestrictionNote } from "@/lib/flights/airline-class";

const airlines = [
  { code: "WN", name: "Southwest Airlines" },
  { code: "DL", name: "Delta Air Lines" },
  { code: "AF", name: "Air France" },
];

describe("airline price point", () => {
  it("keeps budget carriers and drops full-service names", () => {
    const matches = filterAirlines(airlines, { pricePoint: "budget" });
    expect(matches.map((airline) => airline.code)).toEqual(["WN"]);
  });

  it("keeps a named airline inside the price point", () => {
    const matches = filterAirlines(airlines, {
      airlines: "delta",
      pricePoint: "premium",
    });
    expect(matches.map((airline) => airline.name)).toEqual(["Delta Air Lines"]);
    const note = flightRestrictionNote({
      chosen: "Delta Air Lines",
      pricePoint: "premium",
      matches,
    });
    expect(note).toContain("Delta Air Lines");
    expect(note).toContain("No fare is shown.");
    expect(note).not.toMatch(/\$\d/);
  });
});
