import { describe, expect, it } from "vitest";
import {
  destinationImageUrl,
  hasCuratedCityImage,
  LEGACY_TRAVEL_FLATLAY,
  resolveHeroMetro,
} from "@/lib/destination-image";

describe("hero metro aliases", () => {
  it("maps Bellevue to the Seattle photo", () => {
    const r = resolveHeroMetro("Bellevue");
    expect(r.metro).toBe("seattle");
    expect(r.matched).toBe(true);
    expect(r.caption).toMatch(/Seattle/i);
    expect(destinationImageUrl("Bellevue")).toBe(destinationImageUrl("Seattle"));
  });

  it("maps Redmond and Tacoma to Seattle", () => {
    expect(resolveHeroMetro("Redmond").metro).toBe("seattle");
    expect(resolveHeroMetro("Tacoma").metro).toBe("seattle");
  });

  it("keeps direct Seattle matches", () => {
    expect(hasCuratedCityImage("Seattle")).toBe(true);
    expect(resolveHeroMetro("Seattle").caption).toBe("Seattle");
  });

  it("uses curated photos for Discover catalog cities instead of the travel flatlay", () => {
    for (const city of ["Lisbon", "Kyoto", "Prague", "Seoul", "Cape Town"]) {
      expect(hasCuratedCityImage(city)).toBe(true);
      expect(destinationImageUrl(city)).not.toBe(LEGACY_TRAVEL_FLATLAY);
    }
  });

  it("does not reuse the camera/notebook/pencil flatlay as the unknown-city fallback", () => {
    const a = destinationImageUrl("Unknownville Alpha");
    const b = destinationImageUrl("Somewhere Else Beta");
    expect(a).not.toBe(LEGACY_TRAVEL_FLATLAY);
    expect(b).not.toBe(LEGACY_TRAVEL_FLATLAY);
    expect(a).not.toBe(b);
  });

  it("keeps unknown-city fallbacks stable across calls", () => {
    expect(destinationImageUrl("Zorblax")).toBe(destinationImageUrl("Zorblax"));
  });
});
