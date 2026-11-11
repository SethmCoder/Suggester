import { describe, expect, it } from "vitest";
import { buildLocalAssistantPatch } from "@/lib/ai/assistant-local";
import {
  accessNote,
  applyDayConstraints,
  feeLabel,
  nameIsAvoided,
  partyFit,
  stopCap,
  weightedInterestMatch,
} from "@/lib/ai/constraints";
import { planRainChange } from "@/lib/ai/replan";
import { expandInterestQueries } from "@/lib/ai/validate-day";
import type { ActivityRow } from "@/lib/types/trip";

function row(partial: Partial<ActivityRow> & Pick<ActivityRow, "id" | "day_id" | "name">): ActivityRow {
  return {
    place_id: null,
    address: null,
    lat: null,
    lng: null,
    start_time: "10:00",
    end_time: null,
    duration_minutes: 60,
    travel_minutes_from_prev: 0,
    priority: "preferred",
    planning_note: null,
    hours_verified: false,
    opening_hours: null,
    website_uri: null,
    google_maps_uri: null,
    photo_name: null,
    popularity_label: null,
    popularity_sources: null,
    popularity_attribution_urls: null,
    schedule_warnings: null,
    sort_order: 0,
    user_locked: false,
    completed: false,
    source: "openstreetmap",
    ...partial,
  };
}

describe("constraint fixtures", () => {
  it("ranks a different stop first when the lead interest changes", () => {
    const aviation = weightedInterestMatch(["museum", "aviation"], ["aviation", "food"], {
      aviation: 3,
      food: 1,
    });
    const food = weightedInterestMatch(["restaurant", "food"], ["aviation", "food"], {
      aviation: 1,
      food: 3,
    });
    const aviationAsFoodLead = weightedInterestMatch(["museum", "aviation"], ["aviation", "food"], {
      aviation: 1,
      food: 3,
    });
    expect(aviation).toBeGreaterThan(aviationAsFoodLead);
    expect(food).toBeGreaterThan(aviationAsFoodLead);
  });

  it("drops a routed walk over the cap and keeps an estimate", () => {
    const routed = applyDayConstraints(
      [
        {
          placeId: "a",
          name: "Far park",
          startTime: "10:00",
          durationMinutes: 60,
          travelMinutesFromPrev: 40,
          travelRouted: true,
        },
      ],
      { maxWalkMinutes: 15, walking: true, stepFree: false },
    );
    expect(routed.kept).toHaveLength(0);
    expect(routed.dropped[0]?.reason).toMatch(/40 minutes/);

    const estimate = applyDayConstraints(
      [
        {
          placeId: "a",
          name: "Far park",
          startTime: "10:00",
          durationMinutes: 60,
          travelMinutesFromPrev: 40,
          travelRouted: false,
        },
      ],
      { maxWalkMinutes: 15, walking: true, stepFree: false },
    );
    expect(estimate.kept).toHaveLength(1);
  });

  it("keeps a local stop out of the transit window", () => {
    const result = applyDayConstraints(
      [
        {
          placeId: "transit:1",
          name: "Train to Kyoto",
          startTime: "12:00",
          durationMinutes: 150,
        },
        {
          placeId: "museum",
          name: "City museum",
          startTime: "13:00",
          durationMinutes: 60,
        },
      ],
      {
        walking: true,
        stepFree: false,
        transit: [{ start: "12:00", durationMinutes: 150 }],
      },
    );
    expect(result.kept.map((stop) => stop.placeId)).toEqual(["transit:1"]);
  });

  it("adds an aviation museum search for an aviation interest", () => {
    expect(expandInterestQueries(["aviation"])).toContain("aviation museum");
  });

  it("downranks nightlife for a family and keeps the day shorter", () => {
    expect(partyFit(["nightlife", "bar"], "family")).toBeLessThan(partyFit(["park"], "family"));
    expect(stopCap({ intensity: "packed", party: "family" })).toBe(4);
    expect(stopCap({ intensity: "packed", party: "friends" })).toBe(5);
    expect(stopCap({ intensity: "relaxed" })).toBe(3);
    expect(stopCap({ intensity: "balanced" })).toBe(4);
  });

  it("does not call a place accessible when the wheelchair tag is missing", () => {
    expect(accessNote({ wheelchair: null, stepFree: true }).note).toBe("Accessibility is not listed.");
    expect(accessNote({ wheelchair: null, stepFree: true }).note.toLowerCase()).not.toMatch(
      /wheelchair-accessible/,
    );
    expect(accessNote({ wheelchair: "no", stepFree: true }).drop).toBe(true);
    expect(accessNote({ wheelchair: "yes", stepFree: true }).note).toMatch(/wheelchair-accessible/);
    expect(feeLabel("yes")).toMatch(/amount not listed/);
    expect(feeLabel(null)).toBe("Cost not listed");
    expect(nameIsAvoided("Casino night", ["casino"])).toBe(true);
  });

  it("replaces an outdoor stop on one day and leaves the other day", () => {
    const days = [
      { id: "day-a", day_index: 0 },
      { id: "day-b", day_index: 1 },
    ];
    const activities = [
      row({ id: "park", day_id: "day-a", name: "Riverside park" }),
      row({ id: "keep", day_id: "day-b", name: "City museum" }),
    ];
    const patch = planRainChange({
      message: "It is raining today",
      days,
      activities,
      replacement: { name: "Indoor gallery", lat: 1, lng: 2, placeId: "osm:1" },
    });
    const deleted = patch.operations.filter((op) => op.op === "delete").map((op) => op.activityId);
    expect(deleted).toEqual(["park"]);
    expect(patch.operations.some((op) => op.op === "insert" && op.name === "Indoor gallery")).toBe(true);
    expect(buildLocalAssistantPatch({ message: "It is raining today", days, activities }).operations).toEqual(
      patch.operations.filter((op) => op.op === "delete"),
    );
  });
});
