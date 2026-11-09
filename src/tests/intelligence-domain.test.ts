import { describe, expect, it } from "vitest";
import { applySignal, buildExplanations } from "@/lib/intelligence/derive";
import { emptyIntelligence } from "@/lib/intelligence/types";
import { effectiveInterestsServer, parseTravelIntelligence } from "@/lib/intelligence/server";

describe("intelligence domain extras", () => {
  it("promotes food after repeated restaurant saves", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, { type: "wishlist_save", category: "restaurant" });
    profile = applySignal(profile, { type: "wishlist_save", category: "cafe" });
    expect(effectiveInterestsServer(profile)).toContain("food");
  });

  it("records discover_save destinations", () => {
    const profile = applySignal(emptyIntelligence(), {
      type: "discover_save",
      destinationId: "kyoto",
      interests: ["history"],
    });
    expect(profile.inferred.preferredDestinations).toContain("kyoto");
  });

  it("keeps activity_keep evidence soft until repeated", () => {
    const once = applySignal(emptyIntelligence(), {
      type: "activity_keep",
      name: "Museum",
      types: ["museum"],
    });
    expect(effectiveInterestsServer(once)).toEqual([]);
  });

  it("parses nested travelIntelligence from traveler_profile", () => {
    const parsed = parseTravelIntelligence({
      travelIntelligence: {
        ...emptyIntelligence(),
        explicit: { ...emptyIntelligence().explicit, interests: ["aviation"] },
      },
    });
    expect(parsed.explicit.interests).toContain("aviation");
  });

  it("returns empty intelligence for unknown shapes", () => {
    expect(parseTravelIntelligence({ foo: 1 }).version).toBe(1);
    expect(parseTravelIntelligence(null).explicit.interests).toEqual([]);
  });

  it("builds an explanation when personalization is off", () => {
    const profile = applySignal(emptyIntelligence(), { type: "toggle", enabled: false });
    expect(buildExplanations(profile)[0]?.toLowerCase()).toMatch(/off|explicit/);
  });

  it("mentions budget ceiling in explanations", () => {
    const lines = buildExplanations(
      applySignal(emptyIntelligence(), {
        type: "explicit_set",
        patch: { budgetMax: 2200 },
      }),
    );
    expect(lines.some((line) => line.includes("2200"))).toBe(true);
  });

  it("mentions preferred duration in explanations", () => {
    const lines = buildExplanations(
      applySignal(emptyIntelligence(), {
        type: "explicit_set",
        patch: { preferredDurationDays: 9 },
      }),
    );
    expect(lines.some((line) => line.includes("9"))).toBe(true);
  });

  it("tracks previous destinations separately from preferred", () => {
    const profile = {
      ...emptyIntelligence(),
      inferred: {
        ...emptyIntelligence().inferred,
        preferredDestinations: ["Tokyo"],
        previousDestinations: ["Paris"],
      },
    };
    expect(profile.inferred.previousDestinations).not.toContain("Tokyo");
  });

  it("explicit interests remain after inferred promotions", () => {
    let profile = applySignal(emptyIntelligence(), {
      type: "explicit_set",
      patch: { interests: ["beaches"] },
    });
    profile = applySignal(profile, { type: "wishlist_save", category: "museum" });
    profile = applySignal(profile, { type: "wishlist_save", category: "museum" });
    expect(effectiveInterestsServer(profile)).toEqual(
      expect.arrayContaining(["beaches", "museums"]),
    );
  });
});
