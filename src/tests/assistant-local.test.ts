import { describe, expect, it } from "vitest";
import { buildLocalAssistantPatch } from "@/lib/ai/assistant-local";
import {
  dayCentroid,
  isFoodRecommendQuery,
  scoreRestaurantNearDay,
} from "@/lib/ai/recommend-food";
import { demoActivities, demoDays } from "@/lib/demo/data";
import type { DiscoveredPlace } from "@/lib/places/types";

describe("local itinerary maker assistant", () => {
  it("reshuffles day 1 for a flight delay instead of only shifting", () => {
    const patch = buildLocalAssistantPatch({
      message: "My flight is delayed by 2 hours on day 1",
      days: demoDays,
      activities: demoActivities,
      dayEnd: "21:00",
    });
    const ops = patch.operations.map((o) => o.op);
    expect(ops.includes("update") || ops.includes("set_travel") || ops.includes("delete")).toBe(
      true,
    );
    // Should not be a lone blind shift_day
    expect(ops.filter((o) => o === "shift_day").length).toBe(0);
    expect(patch.summary.toLowerCase()).toMatch(/reshuffl|delay|retim/);
  });

  it("replaces a named place", () => {
    const patch = buildLocalAssistantPatch({
      message: "Change the Louvre to Musée d'Orsay",
      days: demoDays,
      activities: demoActivities,
    });
    expect(patch.operations[0]?.op).toBe("replace");
    if (patch.operations[0]?.op === "replace") {
      expect(patch.operations[0].newName.toLowerCase()).toContain("orsay");
    }
  });

  it("detects food recommendation queries", () => {
    expect(isFoodRecommendQuery("best places to eat near the Eiffel Tower")).toBe(
      true,
    );
    expect(isFoodRecommendQuery("recommend lunch for day 2")).toBe(true);
    expect(isFoodRecommendQuery("My flight is delayed by 2 hours")).toBe(false);
  });

  it("scores nearby restaurants higher than far ones", () => {
    const center = dayCentroid(
      demoActivities.filter((a) => a.day_id === demoDays[0].id),
    );
    expect(center).toBeTruthy();
    const near: DiscoveredPlace = {
      placeId: "osm:node:1",
      name: "Near Bistro",
      category: "restaurant",
      address: "1 Rue Near",
      lat: center!.lat + 0.001,
      lng: center!.lng + 0.001,
      osmId: "node/1",
      tags: { amenity: "restaurant", cuisine: "french", name: "Near Bistro" },
      wikipediaTitle: null,
      wikidataId: null,
      source: "openstreetmap",
      retrievedAt: new Date().toISOString(),
    };
    const far: DiscoveredPlace = {
      ...near,
      placeId: "osm:node:2",
      name: "Far Restaurant",
      lat: center!.lat + 0.08,
      lng: center!.lng + 0.08,
      osmId: "node/2",
      tags: {
        amenity: "restaurant",
        cuisine: "french",
        wikipedia: "en:Famous Place",
        name: "Far Restaurant",
      },
      wikipediaTitle: "Famous_Place",
    };
    const nearScore = scoreRestaurantNearDay({
      place: near,
      centerLat: center!.lat,
      centerLng: center!.lng,
    });
    const farScore = scoreRestaurantNearDay({
      place: far,
      centerLat: center!.lat,
      centerLng: center!.lng,
    });
    expect(nearScore.score).toBeGreaterThan(farScore.score);
    expect(nearScore.distKm).toBeLessThan(farScore.distKm);
  });
});
