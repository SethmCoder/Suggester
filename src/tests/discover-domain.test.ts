import { describe, expect, it } from "vitest";
import { DESTINATION_CATALOG } from "@/lib/discover/catalog";
import { parseDiscoveryQueryLocal } from "@/lib/discover/parse";
import { rankDestinations, scoreDestination, tierFromBudget } from "@/lib/discover/score";
import { buildDiscoverSections } from "@/lib/discover/sections";

describe("discover domain extras", () => {
  it("maps budget ceilings to tiers", () => {
    expect(tierFromBudget(1000)).toBe("lower");
    expect(tierFromBudget(2500)).toBe("mid");
    expect(tierFromBudget(6000)).toBe("higher");
  });

  it("parses international travel intent", () => {
    const filters = parseDiscoveryQueryLocal(
      "I want to travel internationally for 8 days under $2000",
    );
    expect(filters.international).toBe(true);
    expect(filters.durationDays).toBe(8);
    expect(filters.budgetMax).toBe(2000);
  });

  it("parses cool climate requests", () => {
    const filters = parseDiscoveryQueryLocal("Find somewhere cool in November");
    expect(filters.climate === "cool" || filters.seasonMonth === 11).toBe(true);
  });

  it("scores a destination with why explanations", () => {
    const row = DESTINATION_CATALOG[0];
    const scored = scoreDestination(
      row,
      { interests: row.interests.slice(0, 2), climate: "either" },
      {},
    );
    expect(scored.why.length).toBeGreaterThan(0);
    expect(scored.score).toBeGreaterThan(0);
  });

  it("excludes previously visited destinations via preference soft penalty", () => {
    const target = DESTINATION_CATALOG.find((row) => row.id === "rome");
    expect(target).toBeTruthy();
    const scored = scoreDestination(
      target!,
      { interests: ["history"], climate: "either" },
      { previousDestinations: ["Rome, Italy"] },
    );
    expect(scored.scoreBreakdown.preference).toBeLessThanOrEqual(0.2);
  });

  it("returns only the top answer list", () => {
    const built = buildDiscoverSections(
      { interests: ["food"], climate: "either" },
      { savedNames: ["Tokyo", "Kyoto"], dream: "ramen and temples" },
    );
    expect(built.sections).toHaveLength(1);
    expect(built.sections[0]?.id).toBe("recommended");
  });

  it("limits ranked results to the requested count", () => {
    const ranked = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["nature"], climate: "either" },
      {},
      3,
    );
    expect(ranked).toHaveLength(3);
  });

  it("can surface quieter catalog cities when shortlisted", () => {
    const built = buildDiscoverSections({
      interests: ["culture", "food"],
      climate: "either",
      shortlistIds: ["hanoi", "oaxaca", "krakow"],
    });
    const ids = built.sections[0]?.destinations.map((row) => row.id) ?? [];
    expect(ids.slice(0, 3)).toEqual(["hanoi", "oaxaca", "krakow"]);
  });

  it("does not invent dollar prices in budget notes", () => {
    const ranked = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["history"], budgetMax: 2000, climate: "either" },
      {},
      4,
    );
    for (const row of ranked) {
      expect(row.budgetNote.toLowerCase()).not.toMatch(/\$\d/);
    }
  });

  it("keeps season notes labeled as catalog estimates", () => {
    const ranked = rankDestinations(
      DESTINATION_CATALOG,
      { interests: ["beaches"], seasonMonth: 7, climate: "warm" },
      {},
      4,
    );
    expect(ranked[0]?.seasonsConfidence).toBe("catalog");
  });
});
