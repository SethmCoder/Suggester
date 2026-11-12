import { describe, expect, it } from "vitest";
import {
  matchKnownPark,
  parkDayAssignmentsFromText,
  withinCityRadiusKm,
} from "@/lib/trips/known-parks";

describe("known-parks", () => {
  it("matches Tokyo Disney parks", () => {
    expect(matchKnownPark("Tokyo Disneyland", "Tokyo")?.id).toBe(
      "tokyo-disneyland",
    );
    expect(matchKnownPark("Tokyo DisneySea", "Tokyo")?.id).toBe(
      "tokyo-disneysea",
    );
  });

  it("assigns Day 2 / Day 3 from idealTrip text", () => {
    const map = parkDayAssignmentsFromText(
      "Day 2 is a full day at Tokyo Disneyland (Maihama). Day 3 is a full day at Tokyo DisneySea.",
      ["Tokyo Disneyland", "Tokyo DisneySea"],
      5,
    );
    expect(map.get(1)?.id).toBe("tokyo-disneyland");
    expect(map.get(2)?.id).toBe("tokyo-disneysea");
  });

  it("rejects far-away coordinates", () => {
    const tokyo = { lat: 35.6895, lng: 139.6917 };
    expect(withinCityRadiusKm(35.6329, 139.8804, tokyo, 55)).toBe(true); // Maihama
    expect(withinCityRadiusKm(38.8775, -9.0949, tokyo, 55)).toBe(false); // Portugal
  });
});
