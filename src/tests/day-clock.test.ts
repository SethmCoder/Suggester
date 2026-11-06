import { describe, expect, it } from "vitest";
import { fitDayClock } from "@/lib/ai/scheduler";
import { dropRepeatedExperiences, expandInterestQueries } from "@/lib/ai/validate-day";
import { budgetFromConversation } from "@/lib/trips/budget";
import { localThingsQuery } from "@/lib/things/ask";

describe("day clock", () => {
  it("moves the next stop by travel time and drops one that passes the end of the day", () => {
    const result = fitDayClock(
      [
        {
          placeId: "a",
          name: "Park",
          startTime: "10:00",
          durationMinutes: 90,
          travelMinutesFromPrev: 0,
        },
        {
          placeId: "b",
          name: "Museum",
          startTime: "11:30",
          durationMinutes: 90,
          travelMinutesFromPrev: 80,
        },
      ],
      {
        dayEnd: "13:00",
        mealGapMinutes: 0,
        isMeal: () => false,
        anchored: () => false,
      },
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].startTime).toBe("10:00");
    expect(result.dropped).toHaveLength(1);
  });

  it("leaves a meal gap when the day has no restaurant", () => {
    const result = fitDayClock(
      [
        { placeId: "a", startTime: "10:00", durationMinutes: 120, travelMinutesFromPrev: 0 },
        { placeId: "b", startTime: "12:00", durationMinutes: 60, travelMinutesFromPrev: 15 },
      ],
      {
        dayEnd: "21:00",
        mealGapMinutes: 60,
        isMeal: () => false,
        anchored: () => false,
      },
    );
    expect(result.kept[1].startTime).toBe("13:15");
  });
});

describe("day variety", () => {
  it("drops a second museum in a row", () => {
    const result = dropRepeatedExperiences([
      { placeId: "1", name: "City Museum", priority: "preferred", types: ["museum"] },
      { placeId: "2", name: "Art Museum", priority: "preferred", types: ["museum"] },
    ]);
    expect(result.kept.map((item) => item.placeId)).toEqual(["1"]);
  });

  it("adds an aviation museum search for an aviation interest", () => {
    expect(expandInterestQueries(["aviation"])).toContain("aviation museum");
  });
});

describe("budget answers", () => {
  it("reads a range, a split, and a restaurant style", () => {
    const plan = budgetFromConversation(
      "How much is set aside for the whole trip?\n$500 to $1,500\nHow should that money be used?\nMostly free\nWhat kind of restaurants should the days lean toward?\nStreet food and casual counters",
    );
    expect(plan.total).toBe(1500);
    expect(plan.allocation).toBe("mostly-free");
    expect(plan.restaurantStyle).toBe("street");
  });
});

describe("things search", () => {
  it("asks for an area when the message has no city", () => {
    expect(localThingsQuery("museums", "").ask).toMatch(/area/i);
  });

  it("keeps a city named in the message", () => {
    const query = localThingsQuery("Museums in Tokyo", "");
    expect(query.city).toBe("Tokyo");
    expect(query.query.toLowerCase()).toContain("tokyo");
    expect(query.ask).toBeNull();
  });
});
