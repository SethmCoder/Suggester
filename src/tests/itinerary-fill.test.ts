import { describe, expect, it } from "vitest";
import { mergeSparseAiSchedule } from "@/lib/ai/generate-itinerary";
import { dropRepeatedExperiences } from "@/lib/ai/validate-day";

describe("itinerary first-plan fill", () => {
  it("tops up a sparse day-0-only AI schedule across the full day plan", () => {
    const dayPlan = [
      {
        dayIndex: 0,
        city: "Seattle",
        legIndex: 0,
        isArrivalTransitDay: false,
        previousCity: null,
        anchorLat: 47.6,
        anchorLng: -122.3,
      },
      {
        dayIndex: 1,
        city: "Seattle",
        legIndex: 0,
        isArrivalTransitDay: false,
        previousCity: null,
        anchorLat: 47.6,
        anchorLng: -122.3,
      },
      {
        dayIndex: 2,
        city: "Seattle",
        legIndex: 0,
        isArrivalTransitDay: false,
        previousCity: null,
        anchorLat: 47.6,
        anchorLng: -122.3,
      },
    ];

    const merged = mergeSparseAiSchedule({
      perDay: 3,
      dayPlan,
      ai: {
        days: [
          {
            dayIndex: 0,
            activities: [
              {
                placeId: "osm:node:1",
                startTime: "10:00",
                durationMinutes: 90,
                priority: "preferred",
              },
            ],
          },
        ],
      },
      fallback: {
        days: [
          {
            dayIndex: 0,
            activities: [
              {
                placeId: "osm:node:1",
                startTime: "10:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:2",
                startTime: "12:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:3",
                startTime: "14:00",
                durationMinutes: 90,
                priority: "preferred",
              },
            ],
          },
          {
            dayIndex: 1,
            activities: [
              {
                placeId: "osm:node:4",
                startTime: "10:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:5",
                startTime: "12:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:6",
                startTime: "14:00",
                durationMinutes: 90,
                priority: "preferred",
              },
            ],
          },
          {
            dayIndex: 2,
            activities: [
              {
                placeId: "osm:node:7",
                startTime: "10:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:8",
                startTime: "12:00",
                durationMinutes: 90,
                priority: "preferred",
              },
              {
                placeId: "osm:node:9",
                startTime: "14:00",
                durationMinutes: 90,
                priority: "preferred",
              },
            ],
          },
        ],
      },
    });

    expect(merged.days).toHaveLength(3);
    expect(merged.days[0].activities.map((a) => a.placeId)).toEqual([
      "osm:node:1",
      "osm:node:2",
      "osm:node:3",
    ]);
    expect(merged.days[1].activities).toHaveLength(3);
    expect(merged.days[2].activities).toHaveLength(3);
  });

  it("keeps enough sightseeing when the pool is all one experience type", () => {
    const items = [
      { placeId: "a", name: "Museum A", types: ["museum"], priority: "preferred" },
      { placeId: "b", name: "Museum B", types: ["museum"], priority: "preferred" },
      { placeId: "c", name: "Museum C", types: ["museum"], priority: "preferred" },
    ];
    const { kept } = dropRepeatedExperiences(items, { minSightseeing: 3 });
    expect(kept).toHaveLength(3);
  });
});
