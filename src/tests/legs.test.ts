import { describe, expect, it } from "vitest";
import {
  expandLegsToDays,
  estimateIntercityMinutes,
  haversineKm,
} from "@/lib/trips/legs";

describe("multi-city legs", () => {
  it("expands Paris 2 → Toulouse 3 → Paris 2 into 7 days with transit flags", () => {
    const days = expandLegsToDays([
      { city: "Paris", days: 2, hotel: "Hotel A", lat: 48.85, lng: 2.35 },
      { city: "Toulouse", days: 3, hotel: "Hotel B", lat: 43.6, lng: 1.44 },
      { city: "Paris", days: 2, hotel: "Hotel A", lat: 48.85, lng: 2.35 },
    ]);
    expect(days).toHaveLength(7);
    expect(days[0].city).toBe("Paris");
    expect(days[0].isArrivalTransitDay).toBe(false);
    expect(days[2].city).toBe("Toulouse");
    expect(days[2].isArrivalTransitDay).toBe(true);
    expect(days[2].previousCity).toBe("Paris");
    expect(days[5].city).toBe("Paris");
    expect(days[5].isArrivalTransitDay).toBe(true);
  });

  it("estimates Paris–Toulouse as a same-day rail/car hop", () => {
    const km = haversineKm(48.85, 2.35, 43.6, 1.44);
    const mins = estimateIntercityMinutes(km);
    expect(km).toBeGreaterThan(500);
    expect(mins).toBeGreaterThan(180);
    expect(mins).toBeLessThan(600);
  });
});
