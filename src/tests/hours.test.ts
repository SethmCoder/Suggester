import { describe, expect, it } from "vitest";
import { checkVisitAgainstHours, fitVisit } from "@/lib/ai/hours";

const wednesday = new Date(2026, 5, 3);
const sunday = new Date(2026, 5, 7);

describe("opening hours check", () => {
  it("marks missing hours as unverified warning", () => {
    const r = checkVisitAgainstHours({
      openingHours: undefined,
      visitStartTime: "10:00",
      durationMinutes: 60,
      dayDate: wednesday,
    });
    expect(r.ok).toBe(true);
    expect(r.warning).toContain("unverified");
    expect(r.warning?.toLowerCase()).not.toMatch(/\bclosed\b/);
  });

  it("keeps a visit inside published weekday hours", () => {
    const fit = fitVisit({
      openingHours: "Mo-Fr 09:00-18:00",
      cursor: "10:00",
      durationMinutes: 60,
      dayDate: wednesday,
      dayEnd: "21:00",
    });
    expect(fit.status).toBe("open");
    if (fit.status === "open") {
      expect(fit.start).toBe("10:00");
      expect(fit.moved).toBe(false);
      expect(fit.window).toBe("09:00-18:00");
    }
  });

  it("moves an early visit to the published opening time", () => {
    const fit = fitVisit({
      openingHours: "Mo-Fr 09:00-18:00",
      cursor: "08:15",
      durationMinutes: 90,
      dayDate: wednesday,
      dayEnd: "21:00",
    });
    expect(fit).toMatchObject({ status: "open", start: "09:00", moved: true });
  });

  it("does not schedule a place on a day the source says is closed", () => {
    const fit = fitVisit({
      openingHours: "Mo-Fr 09:00-18:00; Sa 10:00-16:00; Su off",
      cursor: "11:00",
      durationMinutes: 60,
      dayDate: sunday,
      dayEnd: "21:00",
    });
    expect(fit.status).toBe("closed");
    if (fit.status === "closed") {
      expect(fit.reason.toLowerCase()).toContain("closed");
    }
  });

  it("uses the afternoon range when the morning range has ended", () => {
    const fit = fitVisit({
      openingHours: "Mo-Fr 09:00-12:00,13:00-18:00",
      cursor: "12:10",
      durationMinutes: 60,
      dayDate: wednesday,
      dayEnd: "21:00",
    });
    expect(fit).toMatchObject({ status: "open", start: "13:00", window: "13:00-18:00" });
  });

  it("does not invent hours from a value it cannot read", () => {
    const fit = fitVisit({
      openingHours: "sunrise-sunset",
      cursor: "10:00",
      durationMinutes: 60,
      dayDate: wednesday,
    });
    expect(fit.status).toBe("unknown");
  });
});
