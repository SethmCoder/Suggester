import { describe, expect, it } from "vitest";
import type { ExplorerPlace } from "@/lib/explorer/types";
import {
  emptyPreferences,
  haversineKm,
  keepKnownPlaces,
  keepKnownPlan,
  mergePreferences,
  withTravelEstimates,
} from "@/lib/explorer/validate";
import { filterBudget } from "@/lib/explorer/search";
import { cityCenter } from "@/lib/explorer/osm-search";
import { localThingsQuery } from "@/lib/things/ask";

const places: ExplorerPlace[] = [
  {
    id: "a",
    name: "North Gallery",
    category: "museums",
    address: "1 North St",
    lat: 35.68,
    lng: 139.76,
    rating: 4.4,
    reviewCount: 120,
    priceLevel: "$$",
    hours: null,
    mapsUrl: null,
    photoName: null,
    source: "google",
    why: "",
  },
  {
    id: "b",
    name: "Free Park",
    category: "nature",
    address: null,
    lat: 35.69,
    lng: 139.77,
    rating: null,
    reviewCount: null,
    priceLevel: "Free",
    hours: null,
    mapsUrl: null,
    photoName: null,
    source: "openstreetmap",
    why: "",
  },
  {
    id: "c",
    name: "Fancy Dining",
    category: "restaurants",
    address: "9 High St",
    lat: 35.7,
    lng: 139.78,
    rating: 4.8,
    reviewCount: 40,
    priceLevel: "$$$$",
    hours: null,
    mapsUrl: null,
    photoName: null,
    source: "google",
    why: "",
  },
];

describe("explorer and things helpers domain", () => {
  it("returns empty explorer preferences", () => {
    expect(emptyPreferences()).toBeTruthy();
  });

  it("merges preference patches", () => {
    const merged = mergePreferences(emptyPreferences(), { cuisine: "ramen" });
    expect(merged.cuisine).toBe("ramen");
  });

  it("filters places by budget cap", () => {
    const cheap = filterBudget(places, "$");
    expect(cheap.map((place) => place.id)).not.toContain("c");
    expect(cheap.map((place) => place.id)).toContain("b");
  });

  it("keeps known place ids only", () => {
    expect(
      keepKnownPlaces(
        [
          { id: "a", why: "ok" },
          { id: "missing", why: "no" },
        ],
        places,
      ).map((place) => place.id),
    ).toEqual(["a"]);
  });

  it("estimates positive travel minutes between stops", () => {
    const plan = keepKnownPlan(
      [
        {
          title: "Day",
          stops: [
            { placeId: "a", startTime: "10:00", durationMinutes: 60, note: "" },
            { placeId: "b", startTime: "12:00", durationMinutes: 60, note: "" },
          ],
        },
      ],
      places,
    );
    const timed = withTravelEstimates(plan, places);
    expect(timed[0]?.stops[1]?.travelMinutes).toBeGreaterThan(0);
  });

  it("computes haversine distance in km", () => {
    expect(haversineKm(35.68, 139.76, 35.69, 139.77)).toBeGreaterThan(0);
  });

  it("resolves a known city center", () => {
    const center = cityCenter("Tokyo");
    expect(center?.lat).toBeTypeOf("number");
    expect(center?.lng).toBeTypeOf("number");
  });

  it("asks for a city when Things Search has none", () => {
    const local = localThingsQuery("find museums", "");
    expect(local.ask).toMatch(/area|city|look/i);
  });

  it("extracts city and museum category from a Things query", () => {
    const local = localThingsQuery("museums in Kyoto", "");
    expect(local.city.toLowerCase()).toContain("kyoto");
    expect(local.category).toBe("museums");
    expect(local.ask).toBeNull();
  });

  it("detects restaurant Things queries", () => {
    const local = localThingsQuery("best restaurants in Osaka", "Osaka");
    expect(local.category).toBe("restaurants");
    expect(local.query.toLowerCase()).toMatch(/restaurant|osaka/);
  });
});
