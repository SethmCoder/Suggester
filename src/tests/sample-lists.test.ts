import { describe, expect, it } from "vitest";
import { buildCatalogPackingSample } from "@/lib/trips/sample-lists";

describe("sample packing lists", () => {
  it("adds destination extras for Paris", () => {
    const sample = buildCatalogPackingSample({
      destination: "Paris",
      durationDays: 4,
      party: "couple",
    });
    expect(sample.source).toBe("catalog");
    expect(sample.title).toMatch(/Paris/i);
    expect(sample.items.length).toBeGreaterThan(6);
    expect(sample.items.some((i) => /adapter|EU|scarf|Paris/i.test(i))).toBe(
      true,
    );
  });

  it("still returns essentials for an unknown city", () => {
    const sample = buildCatalogPackingSample({
      destination: "Nowhereville",
      durationDays: 3,
    });
    expect(sample.items).toEqual(
      expect.arrayContaining(["Passport / ID", "Phone charger"]),
    );
  });
});
