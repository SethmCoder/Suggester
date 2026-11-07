import { describe, expect, it } from "vitest";
import { applySignal, buildExplanations } from "@/lib/intelligence/derive";
import { emptyIntelligence } from "@/lib/intelligence/types";
import { effectiveInterestsServer } from "@/lib/intelligence/server";
import { LIST_PRICES, PLAN_LIMITS } from "@/lib/billing/limits";
import { PRO_PRICE_ANNUAL_USD, PRO_PRICE_USD } from "@/lib/billing/entitlements";

describe("travel intelligence learning", () => {
  it("does not treat a single save as a strong inferred interest", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "wishlist_save",
      category: "museum",
      name: "Louvre",
    });
    expect(effectiveInterestsServer(profile)).toEqual([]);
    expect(profile.inferred.interests[0]?.evidence).toBe(1);
  });

  it("promotes architecture after repeated saves", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "wishlist_save",
      category: "architecture",
      name: "Sagrada",
    });
    profile = applySignal(profile, {
      type: "wishlist_save",
      category: "architecture",
      name: "Gaudí house",
    });
    expect(effectiveInterestsServer(profile)).toContain("architecture");
  });

  it("downranks nightlife only after repeated dismissals", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "activity_dismiss",
      name: "Nightclub",
      types: ["nightlife"],
    });
    expect(
      profile.inferred.downrankedInterests.find((row) => row.interest === "nightlife")
        ?.evidence,
    ).toBe(1);
    profile = applySignal(profile, {
      type: "activity_dismiss",
      name: "Bar crawl",
      types: ["nightlife"],
    });
    const interests = effectiveInterestsServer({
      ...profile,
      explicit: { ...profile.explicit, interests: ["nightlife", "food"] },
    });
    expect(interests).toContain("food");
    expect(interests).not.toContain("nightlife");
  });

  it("keeps explicit interests when personalization is disabled", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "explicit_set",
      patch: { interests: ["history"] },
    });
    profile = applySignal(profile, {
      type: "wishlist_save",
      category: "architecture",
    });
    profile = applySignal(profile, {
      type: "wishlist_save",
      category: "architecture",
    });
    profile = applySignal(profile, { type: "toggle", enabled: false });
    expect(effectiveInterestsServer(profile)).toEqual(["history"]);
  });

  it("reset clears inferred and explicit soft state but keeps toggle", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "explicit_set",
      patch: { interests: ["food"] },
    });
    profile = applySignal(profile, { type: "reset" });
    expect(profile.explicit.interests).toEqual([]);
    expect(profile.personalizationEnabled).toBe(true);
  });

  it("explains recommendations without inventing sensitive traits", () => {
    const lines = buildExplanations(
      applySignal(emptyIntelligence(), {
        type: "explicit_set",
        patch: { interests: ["aviation"], budgetMax: 3000 },
      }),
    );
    expect(lines.some((line) => /aviation/i.test(line))).toBe(true);
    expect(lines.every((line) => !/age|gender|race|religion/i.test(line))).toBe(
      true,
    );
  });
});

describe("pro list prices and limits", () => {
  it("centralizes Free/Pro prices and limits", () => {
    expect(PRO_PRICE_USD).toBe(5.99);
    expect(PRO_PRICE_ANNUAL_USD).toBe(49.99);
    expect(LIST_PRICES.proMonthlyUsd).toBe(5.99);
    expect(LIST_PRICES.proAnnualUsd).toBe(49.99);
    expect(PLAN_LIMITS.free.generate).toBe(false);
    expect(PLAN_LIMITS.pro.generate).toBe(true);
    expect(PLAN_LIMITS.free.wishlistCollections).toBe(5);
    expect(PLAN_LIMITS.pro.wishlistCollections).toBeNull();
  });
});
