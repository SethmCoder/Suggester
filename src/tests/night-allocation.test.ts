import { describe, expect, it } from "vitest";
import {
  allocateNightsCatalog,
  parseCitiesFromIdea,
  recalculateNights,
} from "@/lib/trips/night-allocation";

describe("night allocation", () => {
  it("splits Japan nights across Tokyo Kyoto Osaka with interest bias", () => {
    const result = allocateNightsCatalog({
      cities: ["Tokyo", "Kyoto", "Osaka"],
      totalNights: 9,
      interests: ["museums", "architecture"],
      pace: "balanced",
    });
    expect(result.cities).toHaveLength(3);
    expect(result.cities.reduce((s, c) => s + c.nights, 0)).toBe(9);
    expect(result.cities.every((c) => c.nights >= 1)).toBe(true);
    expect(result.summary).toMatch(/Tokyo/);
  });

  it("recalculates after locking Tokyo nights", () => {
    const result = recalculateNights({
      cities: [
        { city: "Tokyo", nights: 5, locked: true },
        { city: "Kyoto", nights: 2, locked: false },
        { city: "Osaka", nights: 2, locked: false },
      ],
      totalNights: 9,
      interests: ["food"],
    });
    expect(result.cities.find((c) => c.city === "Tokyo")?.nights).toBe(5);
    expect(result.cities.reduce((s, c) => s + c.nights, 0)).toBe(9);
  });

  it("parses cities from a free-text idea", () => {
    expect(parseCitiesFromIdea("Tokyo and Kyoto for food")).toEqual(
      expect.arrayContaining(["Tokyo", "Kyoto"]),
    );
    expect(parseCitiesFromIdea("I want to visit Japan for 10 days").length).toBeGreaterThan(0);
  });
});
