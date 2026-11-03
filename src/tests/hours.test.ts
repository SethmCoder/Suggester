import { describe, expect, it } from "vitest";
import { checkVisitAgainstHours } from "@/lib/ai/hours";

describe("opening hours check", () => {
  it("marks missing hours as unverified warning", () => {
    const r = checkVisitAgainstHours({
      openingHours: undefined,
      visitStartTime: "10:00",
      durationMinutes: 60,
      dayDate: new Date("2026-06-03"),
    });
    expect(r.ok).toBe(true);
    expect(r.warning).toContain("unverified");
  });
});
