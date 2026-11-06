import { describe, expect, it } from "vitest";
import type { ExplorerPlace } from "@/lib/explorer/types";
import { keepKnownPlaces, keepKnownPlan, withTravelEstimates } from "@/lib/explorer/validate";

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
    name: "River Walk",
    category: "nature",
    address: null,
    lat: 35.69,
    lng: 139.77,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    hours: null,
    mapsUrl: null,
    photoName: null,
    source: "openstreetmap",
    why: "",
  },
];

describe("explorer plan validation", () => {
  it("drops place ids that were not in the search results", () => {
    const kept = keepKnownPlaces(
      [
        { id: "missing", why: "Invented" },
        { id: "b", why: "A walk by the river." },
      ],
      places,
    );
    expect(kept.map((place) => place.id)).toEqual(["b"]);
    expect(kept[0]?.why).toBe("A walk by the river.");
  });

  it("keeps a timed plan and estimates travel between real coordinates", () => {
    const plan = keepKnownPlan(
      [
        {
          title: "Museums and a walk",
          stops: [
            { placeId: "nope", startTime: "10:00", durationMinutes: 60, note: "skip" },
            { placeId: "a", startTime: "10:00", durationMinutes: 90, note: "Start here." },
            { placeId: "b", startTime: "07:00", durationMinutes: 30, note: "too early" },
            { placeId: "b", startTime: "12:30", durationMinutes: 60, note: "After lunch." },
          ],
        },
      ],
      places,
    );
    const timed = withTravelEstimates(plan, places);
    expect(timed[0]?.stops.map((stop) => stop.placeId)).toEqual(["a", "b"]);
    expect(timed[0]?.stops[1]?.travelMinutes).toBeGreaterThan(0);
  });
});
