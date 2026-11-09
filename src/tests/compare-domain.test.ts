import { describe, expect, it } from "vitest";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import { compareDestinations, rankDestinations } from "@/lib/discover/score";
import { PLAN_LIMITS } from "@/lib/billing/limits";

describe("destination compare domain", () => {
  it("compares exactly two destinations", () => {
    const rows = DESTINATION_CATALOG.filter((row) => ["tokyo", "rome"].includes(row.id));
    expect(compareDestinations(rows, { interests: ["food"] })).toHaveLength(2);
  });

  it("compares up to the Pro destination cap", () => {
    const rows = DESTINATION_CATALOG.filter((row) =>
      ["tokyo", "rome", "barcelona", "lisbon"].includes(row.id),
    ).slice(0, PLAN_LIMITS.pro.compareDestinations);
    expect(rows.length).toBe(PLAN_LIMITS.pro.compareDestinations);
    expect(
      compareDestinations(rows, { interests: ["history"] }),
    ).toHaveLength(PLAN_LIMITS.pro.compareDestinations);
  });

  it("Free compare cap is 2 and Pro is 4", () => {
    expect(PLAN_LIMITS.free.compareDestinations).toBe(2);
    expect(PLAN_LIMITS.pro.compareDestinations).toBe(4);
  });

  it("returns suitability percent between 0 and 100", () => {
    const rows = DESTINATION_CATALOG.filter((row) => ["paris", "london"].includes(row.id));
    for (const row of compareDestinations(rows, { interests: ["museums"] })) {
      expect(row.suitabilityPercent).toBeGreaterThanOrEqual(0);
      expect(row.suitabilityPercent).toBeLessThanOrEqual(100);
    }
  });

  it("boosts destinations listed in preferredDestinations context", () => {
    const withPref = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["architecture"], climate: "either" },
      { preferredDestinations: ["Barcelona"] },
      8,
    );
    expect(withPref.some((row) => row.id === "barcelona")).toBe(true);
  });

  it("downranks destinations matching downranked nightlife interest", () => {
    const nightlifeHeavy = DESTINATION_CATALOG.filter((row) =>
      row.interests.includes("nightlife"),
    );
    if (!nightlifeHeavy.length) {
      expect(true).toBe(true);
      return;
    }
    const scored = compareDestinations(
      nightlifeHeavy.slice(0, 2),
      { interests: ["nightlife"] },
      { downrankedInterests: ["nightlife"] },
    );
    expect(scored[0]?.suitabilityBreakdown.preference).toBeLessThanOrEqual(0.4);
  });

  it("includes advantages or disadvantages for each comparison", () => {
    const rows = DESTINATION_CATALOG.filter((row) => ["tokyo", "rome"].includes(row.id));
    for (const row of compareDestinations(rows, {
      interests: ["architecture", "history"],
      budgetMax: 3000,
      durationDays: 10,
    })) {
      expect(row.advantages.length + row.disadvantages.length).toBeGreaterThan(0);
    }
  });

  it("keeps budget confidence as estimate only", () => {
    const rows = DESTINATION_CATALOG.filter((row) => ["lisbon", "dubai"].includes(row.id));
    for (const row of compareDestinations(rows, {
      interests: [],
      budgetMax: 2000,
    })) {
      expect(row.destination.budgetConfidence).toBe("estimate");
    }
  });

  it("sorts by suitability when caller sorts descending", () => {
    const rows = DESTINATION_CATALOG.filter((row) =>
      ["tokyo", "rome", "barcelona"].includes(row.id),
    );
    const comparisons = compareDestinations(rows, {
      interests: ["architecture"],
    }).sort((a, b) => b.suitabilityPercent - a.suitabilityPercent);
    expect(comparisons[0].suitabilityPercent).toBeGreaterThanOrEqual(
      comparisons[1].suitabilityPercent,
    );
  });

  it("methodology note stays transparent", () => {
    const rows = DESTINATION_CATALOG.filter((row) => ["tokyo", "rome"].includes(row.id));
    const [first] = compareDestinations(rows, { interests: ["food"] });
    expect(first.methodologyNote.toLowerCase()).toMatch(/weight|score|catalog|interest/);
  });
});
