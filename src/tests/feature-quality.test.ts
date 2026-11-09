import { describe, expect, it } from "vitest";
import { weightedInterestMatch } from "@/lib/ai/constraints";
import { fitDayClock, orderByNearestNeighbor } from "@/lib/ai/scheduler";
import {
  experienceBucket,
  interestSynonyms,
  validateAiDay,
} from "@/lib/ai/validate-day";
import { interestWeightsFromIntelligence } from "@/lib/intelligence/server";
import { emptyIntelligence } from "@/lib/intelligence/types";

describe("essential itinerary quality features", () => {
  it("personalizes interest matching with museum synonyms", () => {
    expect(interestSynonyms("museums")).toContain("museum");
    expect(
      weightedInterestMatch(["tourism", "museum"], ["museums"], { museums: 3 }),
    ).toBeGreaterThan(
      weightedInterestMatch(["tourism", "museum"], ["nightlife"], {
        nightlife: 3,
      }),
    );
  });

  it("builds intelligence interest weights for generation", () => {
    const profile = emptyIntelligence();
    profile.explicit.interests = ["food"];
    profile.inferred.interests = [
      {
        interest: "history",
        weight: 2.2,
        source: "inferred",
        evidence: 3,
        updatedAt: new Date().toISOString(),
      },
    ];
    const weights = interestWeightsFromIntelligence(profile);
    expect(weights.food).toBeGreaterThanOrEqual(2);
    expect(weights.history).toBe(3);
  });

  it("validates AI days against candidate cities and ids", () => {
    const result = validateAiDay({
      dayIndex: 0,
      activities: [
        { placeId: "osm:1" },
        { placeId: "osm:missing" },
        { placeId: "osm:1" },
        { placeId: "osm:2" },
      ],
      allowedPlaceIds: new Set(["osm:1", "osm:2"]),
      placeCity: new Map([
        ["osm:1", "Paris"],
        ["osm:2", "Lyon"],
      ]),
      dayCity: "Paris",
    });
    expect(result.kept.map((row) => row.placeId)).toEqual(["osm:1"]);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("orders stops geographically nearest-neighbor", () => {
    const ordered = orderByNearestNeighbor(
      [
        { id: "far", lat: 48.9, lng: 2.4 },
        { id: "near", lat: 48.861, lng: 2.341 },
        { id: "mid", lat: 48.87, lng: 2.35 },
      ],
      { lat: 48.86, lng: 2.34 },
    );
    expect(ordered[0].id).toBe("near");
  });

  it("fitDayClock drops stops past day end after travel", () => {
    const result = fitDayClock(
      [
        {
          placeId: "a",
          startTime: "09:00",
          durationMinutes: 120,
          travelMinutesFromPrev: 0,
        },
        {
          placeId: "b",
          startTime: "11:00",
          durationMinutes: 180,
          travelMinutesFromPrev: 90,
        },
      ],
      {
        dayEnd: "14:00",
        mealGapMinutes: 0,
        isMeal: () => false,
        anchored: () => false,
      },
    );
    expect(result.kept.map((row) => row.placeId)).toEqual(["a"]);
    expect(result.dropped[0]?.reason).toMatch(/past/i);
  });

  it("buckets experiences for day variety", () => {
    expect(experienceBucket(["museum"], "Louvre")).toBe("museum");
    expect(experienceBucket(["park"], "Tuileries")).toBe("park");
  });
});
