import { describe, expect, it } from "vitest";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import { parseDiscoveryQueryLocal } from "@/lib/discover/parse";
import { compareDestinations, rankDestinations } from "@/lib/discover/score";
import { buildDiscoverSections } from "@/lib/discover/sections";

describe("destination discovery", () => {
  it("parses warm February, budget, duration, and interests from natural language", () => {
    const filters = parseDiscoveryQueryLocal(
      "Find somewhere warm in February. I have $2500 and want 10 days with architecture and history.",
    );
    expect(filters.climate).toBe("warm");
    expect(filters.seasonMonth).toBe(2);
    expect(filters.budgetMax).toBe(2500);
    expect(filters.durationDays).toBe(10);
    expect(filters.interests).toEqual(expect.arrayContaining(["architecture", "history"]));
  });

  it("ranks aviation destinations ahead when aviation is requested", () => {
    const ranked = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["aviation"], climate: "either" },
      {},
      8,
    );
    expect(ranked[0]?.id).toBeTruthy();
    const topIds = ranked.slice(0, 4).map((row) => row.id);
    expect(topIds.some((id) => ["seattle", "london", "tokyo", "dubai", "singapore"].includes(id))).toBe(
      true,
    );
  });

  it("prefers lower relative cost bands for a tight budget", () => {
    const ranked = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["history"], budgetMax: 1200, budgetTier: "lower", climate: "either" },
      {},
      5,
    );
    const top = DESTINATION_CATALOG.find((row) => row.id === ranked[0]?.id);
    expect(top?.budgetTier).toBe("lower");
  });

  it("surfaces quieter Kyoto alternatives when asked for similar and less crowded", () => {
    const filters = parseDiscoveryQueryLocal(
      "Show me somewhere similar to Kyoto but less crowded.",
    );
    expect(filters.similarTo?.toLowerCase()).toContain("kyoto");
    expect(filters.lesserKnownOnly).toBe(true);
    const ranked = rankDestinations(DESTINATION_CATALOG, filters, {}, 6);
    expect(ranked.some((row) => row.id === "kanazawa" || row.lesserKnown)).toBe(true);
  });

  it("builds the Discover sections used by the page", () => {
    const built = buildDiscoverSections({
      interests: ["architecture", "history"],
      budgetMax: 3000,
      durationDays: 10,
      climate: "either",
    });
    const ids = built.sections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "recommended",
        "by-interest",
        "by-region",
        "by-season",
        "by-budget",
        "similar",
        "lesser-known",
        "continue",
      ]),
    );
  });

  it("compares two to four destinations with transparent suitability breakdown", () => {
    const rows = DESTINATION_CATALOG.filter((row) =>
      ["tokyo", "rome", "barcelona"].includes(row.id),
    );
    const comparisons = compareDestinations(rows, {
      interests: ["architecture", "history", "food"],
      budgetMax: 3000,
      durationDays: 10,
    });
    expect(comparisons).toHaveLength(3);
    for (const row of comparisons) {
      expect(row.suitabilityPercent).toBeGreaterThan(0);
      expect(row.suitabilityBreakdown.interest).toBeGreaterThanOrEqual(0);
      expect(row.methodologyNote.toLowerCase()).toMatch(/weighted/);
      expect(row.destination.budgetConfidence).toBe("estimate");
      expect(row.destination.seasonsConfidence).toBe("catalog");
    }
  });
});
