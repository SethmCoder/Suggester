import { describe, expect, it } from "vitest";
import {
  assignDayNeighborhoodSeeds,
  filterActsToNeighborhood,
  neighborhoodPool,
  sameDayRadiusKm,
  varietyPickIndex,
} from "@/lib/ai/day-neighborhood";

describe("day-neighborhood", () => {
  it("keeps walk days tighter than transit/drive", () => {
    expect(sameDayRadiusKm("WALK")).toBeLessThan(sameDayRadiusKm("transit"));
    expect(sameDayRadiusKm("transit")).toBeLessThan(sameDayRadiusKm("driving"));
  });

  it("assigns spread seeds across days in one city", () => {
    const seeds = assignDayNeighborhoodSeeds(
      [
        { dayIndex: 0, city: "Tokyo" },
        { dayIndex: 1, city: "Tokyo" },
        { dayIndex: 2, city: "Tokyo" },
      ],
      [
        { placeId: "a", lat: 35.66, lng: 139.7, rank: 0.9, city: "Tokyo" }, // Shibuya-ish
        { placeId: "b", lat: 35.66, lng: 139.71, rank: 0.8, city: "Tokyo" },
        { placeId: "c", lat: 35.71, lng: 139.81, rank: 0.85, city: "Tokyo" }, // east
        { placeId: "d", lat: 35.69, lng: 139.7, rank: 0.7, city: "Tokyo" },
        { placeId: "e", lat: 35.68, lng: 139.76, rank: 0.75, city: "Tokyo" }, // tower-ish
      ],
      new Map([["Tokyo", { lat: 35.66, lng: 139.7 }]]),
    );
    expect(seeds.size).toBe(3);
    const pts = [0, 1, 2].map((i) => seeds.get(i)!);
    // Day 0 near hotel; later days should not all collapse onto the hotel.
    expect(pts[0].lat).toBeCloseTo(35.66, 1);
    const spread = Math.max(
      ...pts.map((p, i) =>
        Math.min(
          ...pts
            .filter((_, j) => j !== i)
            .map((q) => Math.hypot(p.lat - q.lat, p.lng - q.lng)),
        ),
      ),
    );
    expect(spread).toBeGreaterThan(0.01);
  });

  it("filters pool to the neighborhood before widening", () => {
    const pool = [
      { id: "near", lat: 35.66, lng: 139.7 },
      { id: "also", lat: 35.665, lng: 139.705 },
      { id: "far", lat: 35.71, lng: 139.82 },
    ];
    const near = neighborhoodPool(pool, { lat: 35.66, lng: 139.7 }, 4, 2);
    expect(near.map((p) => p.id)).toEqual(["near", "also"]);
  });

  it("drops far non-must-see AI picks", () => {
    const byId = new Map([
      ["near", { lat: 35.66, lng: 139.7 }],
      ["far", { lat: 35.71, lng: 139.82 }],
    ]);
    const kept = filterActsToNeighborhood(
      [
        { placeId: "near", priority: "preferred" },
        { placeId: "far", priority: "preferred" },
      ],
      byId,
      { lat: 35.66, lng: 139.7 },
      4,
    );
    expect(kept.map((a) => a.placeId)).toEqual(["near"]);
  });

  it("avoids variety jumps across town", () => {
    const leftover = [
      { lat: 35.71, lng: 139.82, priority: "preferred", name: "far" },
      { lat: 35.661, lng: 139.701, priority: "preferred", name: "near" },
    ];
    const pick = varietyPickIndex(
      leftover,
      { lat: 35.66, lng: 139.7, priority: "preferred", name: "anchor" },
      "museum",
      (item) => (item.name === "far" ? "park" : "museum"),
      4,
    );
    expect(leftover[pick].name).toBe("near");
  });
});
