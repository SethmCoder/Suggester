import { describe, expect, it } from "vitest";
import {
  IDEAL_TRIP_MAX,
  truncateStringList,
  truncateText,
} from "@/lib/trips/truncate-input";

describe("truncate trip input", () => {
  it("keeps short text and caps huge pastes", () => {
    expect(truncateText("hello", 10)).toBe("hello");
    expect(truncateText("x".repeat(IDEAL_TRIP_MAX + 50), IDEAL_TRIP_MAX)?.length).toBe(
      IDEAL_TRIP_MAX,
    );
  });

  it("trims list items instead of rejecting them", () => {
    expect(
      truncateStringList(["  cafe  ", "y".repeat(500), "", "museum"], 3, 20),
    ).toEqual(["cafe", "y".repeat(20), "museum"]);
  });
});
