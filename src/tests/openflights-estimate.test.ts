import { describe, expect, it } from "vitest";
import { estimateBlockMinutes } from "@/lib/flights/openflights";
import { haversineKm } from "@/lib/ai/scheduler";

describe("openflights flight estimates", () => {
  it("estimates SEA–HND as a long-haul (~9–12h block)", () => {
    // Approx coords when network fetch is unavailable in unit context
    const sea = { lat: 47.4502, lng: -122.3088 };
    const hnd = { lat: 35.5523, lng: 139.7798 };
    const km = haversineKm(sea.lat, sea.lng, hnd.lat, hnd.lng);
    const minutes = estimateBlockMinutes(km);
    expect(km).toBeGreaterThan(7000);
    expect(minutes).toBeGreaterThan(9 * 60);
    expect(minutes).toBeLessThan(14 * 60);
  });
});
