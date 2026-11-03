import { describe, expect, it } from "vitest";
import {
  destinationImageUrl,
  hasCuratedCityImage,
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
});
