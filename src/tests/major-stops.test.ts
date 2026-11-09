import { describe, expect, it } from "vitest";
import {
  idealTripWithMajorStops,
  mergeTripStops,
  nameMatchesStop,
  splitStopList,
} from "@/lib/trips/major-stops";
import { buildItineraryUserPrompt } from "@/lib/ai/prompts";

describe("major stops / create payload", () => {
  it("parses comma and newline stop lists", () => {
    expect(splitStopList("Colosseum, Vatican Museums")).toEqual([
      "Colosseum",
      "Vatican Museums",
    ]);
    expect(splitStopList("A\nB; C")).toEqual(["A", "B", "C"]);
  });

  it("returns empty for blank stop text", () => {
    expect(splitStopList("")).toEqual([]);
    expect(splitStopList("  ,  , ")).toEqual([]);
    expect(splitStopList(null)).toEqual([]);
  });

  it("dedupes stop names case-sensitively by exact trim", () => {
    expect(splitStopList("Louvre, Louvre, Pantheon")).toEqual(["Louvre", "Pantheon"]);
  });

  it("merges major stops with wishlist high priority into mustSee", () => {
    const merged = mergeTripStops({
      majorStops: ["Colosseum"],
      wishlistMust: ["Forum"],
      wishlistPreferred: ["Trastevere walk"],
    });
    expect(merged.mustSee).toEqual(expect.arrayContaining(["Colosseum", "Forum"]));
    expect(merged.preferred).toContain("Trastevere walk");
  });

  it("keeps preferred out of mustSee when names overlap", () => {
    const merged = mergeTripStops({
      majorStops: ["Louvre"],
      preferredText: "Louvre, Orsay",
    });
    expect(merged.mustSee).toEqual(["Louvre"]);
    expect(merged.preferred).toEqual(["Orsay"]);
  });

  it("allows empty major stops so interests-only trips still work", () => {
    const merged = mergeTripStops({});
    expect(merged.mustSee).toEqual([]);
    expect(merged.preferred).toEqual([]);
  });

  it("matches place names loosely for scheduling boosts", () => {
    expect(nameMatchesStop("Colosseum Amphitheatre", "Colosseum")).toBe(true);
    expect(nameMatchesStop("Louvre", "Musée du Louvre")).toBe(true);
    expect(nameMatchesStop("Tower Bridge", "Colosseum")).toBe(false);
  });

  it("appends major-stop guidance into idealTrip once", () => {
    const once = idealTripWithMajorStops("Food first", ["Colosseum"]);
    expect(once).toMatch(/Major stops/);
    expect(once).toMatch(/Colosseum/);
    const twice = idealTripWithMajorStops(once, ["Forum"]);
    expect(twice).toBe(once);
  });

  it("includes preferred stops in the planner user prompt", () => {
    const prompt = buildItineraryUserPrompt({
      destination: "Rome",
      startDate: "2026-05-01",
      endDate: "2026-05-05",
      interests: ["history"],
      intensity: "balanced",
      transport: "walking",
      mustSee: ["Colosseum"],
      preferred: ["Pantheon"],
      avoid: [],
      idealTrip: "",
      candidates: [],
      popularityEnabled: false,
    });
    expect(prompt).toMatch(/Colosseum/);
    expect(prompt).toMatch(/Pantheon/);
    expect(prompt.toLowerCase()).toMatch(/fill remaining/);
  });

  it("caps merged stop lists at 24 entries", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Stop ${i}`);
    const merged = mergeTripStops({ majorStops: many, preferredText: many.join(",") });
    expect(merged.mustSee).toHaveLength(24);
    expect(merged.preferred.length).toBeLessThanOrEqual(24);
  });
});
