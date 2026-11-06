import { describe, expect, it } from "vitest";
import { resolveGeonameCity } from "@/lib/geonames/cities";
import { cityAreaPins } from "@/lib/places/city-pins";

describe("city area pins", () => {
  it("keeps Tokyo on its GeoNames population center and includes Shibuya and Shinjuku", () => {
    const tokyo = resolveGeonameCity("Tokyo");
    expect(tokyo?.featureCode).toBe("PPLC");
    const pins = cityAreaPins("Tokyo");
    expect(pins[0]).toMatchObject({ name: "Tokyo", lat: 35.6895, lng: 139.69171 });
    const names = pins.map((pin) => pin.name);
    expect(names).toContain("Shibuya");
    expect(names).toContain("Shinjuku");
    const shibuya = pins.find((pin) => pin.name === "Shibuya");
    expect(shibuya).toMatchObject({ lat: 35.6589, lng: 139.70665, population: 230609 });
  });

  it("returns no pins when the city is not in the GeoNames data", () => {
    expect(cityAreaPins("NotARealCityXYZ")).toEqual([]);
  });
});
