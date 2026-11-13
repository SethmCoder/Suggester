import { describe, expect, it } from "vitest";
import { buildArchitectWizardHref } from "@/lib/trips/architect-handoff";
import {
  allocateNightsCatalog,
  recalculateNights,
} from "@/lib/trips/night-allocation";

describe("Trip Architect handoff", () => {
  it("A/B: Japan idea cities allocate and lock redistributes", () => {
    const alloc = allocateNightsCatalog({
      cities: ["Tokyo", "Kyoto", "Osaka"],
      totalNights: 11,
      interests: ["food", "culture"],
      pace: "balanced",
    });
    expect(alloc.cities).toHaveLength(3);
    expect(alloc.cities.reduce((s, c) => s + c.nights, 0)).toBe(11);

    const locked = recalculateNights({
      cities: alloc.cities.map((c) => ({
        city: c.city,
        nights: c.city === "Tokyo" ? 5 : c.nights,
        locked: c.city === "Tokyo",
      })),
      totalNights: 11,
      interests: ["food"],
    });
    expect(locked.cities.find((c) => c.city === "Tokyo")?.nights).toBe(5);
    expect(locked.cities.reduce((s, c) => s + c.nights, 0)).toBe(11);
  });

  it("C: confirmationPaste is passed into wizard href", () => {
    const alloc = allocateNightsCatalog({
      cities: ["Tokyo"],
      totalNights: 4,
    });
    const href = buildArchitectWizardHref({
      allocation: alloc,
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      travelers: 2,
      pace: "balanced",
      interests: ["food"],
      mustSee: ["Senso-ji"],
      idea: "Tokyo food trip",
      confirmationPaste: "Confirmation: flight AA100 NRT June 1",
    });
    expect(href).toContain("wizard=1");
    expect(href).toContain("confirmationPaste=");
    // URLSearchParams encodes spaces as +, not %20 from encodeURIComponent.
    const paste = new URL(href, "http://local").searchParams.get(
      "confirmationPaste",
    );
    expect(paste).toContain("Confirmation: flight AA100");
    expect(href).toContain("mustSee=");
  });

  it("D: changing nights mid-flow keeps total via recalculate", () => {
    const mid = recalculateNights({
      cities: [
        { city: "Tokyo", nights: 6, locked: true },
        { city: "Kyoto", nights: 3, locked: false },
        { city: "Osaka", nights: 3, locked: false },
      ],
      totalNights: 12,
    });
    expect(mid.cities.reduce((s, c) => s + c.nights, 0)).toBe(12);
    expect(mid.cities.find((c) => c.city === "Tokyo")?.nights).toBe(6);
  });
});
