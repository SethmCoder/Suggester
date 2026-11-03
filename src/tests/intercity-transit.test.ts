import { describe, expect, it } from "vitest";
import {
  formatIntercityModeLabel,
  intercityModeFromPlaceId,
  planIntercityTransit,
} from "@/lib/trips/intercity-transit";

describe("intercity transit planner", () => {
  it("labels modes clearly", () => {
    expect(formatIntercityModeLabel("major_train")).toBe("Major train");
    expect(formatIntercityModeLabel("flight")).toBe("Flight");
    expect(intercityModeFromPlaceId("transit:ferry:Naples:Capri")).toBe(
      "ferry",
    );
  });

  it("plans Dubai → Abu Dhabi as road/coach-scale (not a long-haul flight)", async () => {
    const plan = await planIntercityTransit({
      fromCity: "Dubai",
      toCity: "Abu Dhabi",
      fromLat: 25.08,
      fromLng: 55.14,
      toLat: 24.45,
      toLng: 54.37,
    });
    expect(["coach", "car", "major_train", "regional_rail"]).toContain(
      plan.mode,
    );
    expect(plan.name).toMatch(/Dubai → Abu Dhabi/);
    expect(plan.departLocal).toMatch(/^\d{2}:\d{2}$/);
    expect(plan.durationMinutes).toBeGreaterThan(60);
    expect(plan.durationMinutes).toBeLessThan(300);
  }, 60000);

  it("marks major_train and flights as booking-required", async () => {
    const plan = await planIntercityTransit({
      fromCity: "Paris",
      toCity: "Lyon",
      fromLat: 48.86,
      fromLng: 2.35,
      toLat: 45.75,
      toLng: 4.85,
    });
    // ~400 km — typically major train
    if (plan.mode === "major_train" || plan.mode === "flight") {
      expect(plan.bookingRequired).toBe(true);
    }
    expect(plan.scheduleWarnings.length).toBeGreaterThan(0);
  }, 60000);
});
